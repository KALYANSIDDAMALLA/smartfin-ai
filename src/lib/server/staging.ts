import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTxs } from "./data";
import { applyMapping, type Mapping, type RawRow } from "@/lib/imports/parse";
import { detectDuplicates } from "@/lib/imports/dedupe";
import { loadLookups } from "./data";
import { suggestFromHistory, suggestFromRules } from "@/lib/finance/suggest";

/** Duplicates can only be within the imported date span (±2 days), so only that slice of the ledger is read. */
export function dupWindow(dates: (string | null)[]): [Date | undefined, Date | undefined] {
  const t = dates.filter(Boolean).map((d) => Date.parse(d!)); if (!t.length) return [new Date(), new Date()];
  return [new Date(Math.min(...t) - 2 * 864e5), new Date(Math.max(...t) + 3 * 864e5)];
}
type Sb = SupabaseClient;

/** (Re)builds staged rows for a batch from raw rows + mapping, flags duplicates against existing ledger. */
export async function stage(sb: Sb, userId: string, batchId: string, raws: RawRow[], map: Mapping, tz: string, pre?: { confidence?: number }[]) {
  const parsed = raws.map((r) => applyMapping(r, map, tz));
  const { txs } = await loadTxs(sb, undefined, ...dupWindow(parsed.map((p) => p.occurredAt)), false);
  const dups = detectDuplicates(parsed.filter((p) => p.amountMinor && p.occurredAt).map((p) => ({ amountMinor: p.amountMinor!, occurredAt: p.occurredAt!, description: p.description, externalRef: p.externalRef })),
    txs.map((t) => ({ amountMinor: t.amountMinor, occurredAt: t.occurredAt, merchant: t.merchant ?? t.description, externalRef: t.externalRef })), tz);
  // Auto-categorise from the user's own history, then built-in rules (suggestions only: the user reviews before confirming).
  const [lookups, histRes] = await Promise.all([loadLookups(sb), sb.from("transactions").select("merchant,name,category_id,type").not("category_id", "is", null).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(800)]);
  const hist = histRes.data ?? [];
  const catFor = (text: string | null, kind: "expense" | "income") => { if (!text) return null; const past = hist.filter((h) => h.type === kind).map((h) => ({ merchant: h.merchant, name: h.name, categoryId: h.category_id })); return (suggestFromHistory(past, text) ?? suggestFromRules(text, lookups.categories, kind))?.categoryId ?? null; };
  let di = 0;
  const rows = parsed.map((p, i) => {
    const complete = !!(p.amountMinor && p.occurredAt); const d = complete ? dups[di++] : { duplicate: false, reason: undefined };
    return { user_id: userId, batch_id: batchId, row_index: i, raw: raws[i], amount_minor: p.amountMinor, occurred_at: p.occurredAt, merchant: p.description, description: p.description, tx_type: p.txType ?? "expense", category_id: catFor(p.description, p.txType === "income" ? "income" : "expense"), external_ref: p.externalRef,
      confidence: Math.min(p.confidence, pre?.[i]?.confidence ?? 1), is_duplicate: d.duplicate, duplicate_reason: d.reason ?? null, include: complete && !d.duplicate };
  });
  await sb.from("staged_import_transactions").delete().eq("batch_id", batchId);
  for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("staged_import_transactions").insert(rows.slice(i, i + 500)); if (error) throw new Error(error.message); }
  return rows.length;
}

