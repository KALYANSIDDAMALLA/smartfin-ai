import "server-only";
import { cache } from "react";
import { memo } from "./memo";
import { userIdOf } from "./auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tx } from "@/lib/finance/types";

export interface Lookups { categories: { id: string; name: string; kind: string }[]; methods: { id: string; code: string; label: string; channel: "online" | "offline" }[]; }

/** Memoised per request, so layout/page/helpers share one lookup fetch. */
const fetchLookups = async (sb: SupabaseClient): Promise<Lookups> => {
  const [c, m] = await Promise.all([
    sb.from("categories").select("id,name,kind").order("name"),
    sb.from("payment_methods").select("id,code,label,channel").order("label"),
  ]);
  let categories = c.data ?? [];
  // Every user gets a "Person" category (for payments to / from individuals); it is created here, once, if it is missing.
  const uid = userIdOf(sb); const missing = (["expense", "income"] as const).filter((k) => !categories.some((x) => x.kind === k && x.name.toLowerCase() === "person"));
  if (uid && missing.length) {
    const { error } = await sb.from("categories").upsert(missing.map((kind) => ({ user_id: uid, name: "Person", kind, is_default: true })), { onConflict: "user_id,kind,name", ignoreDuplicates: true });
    if (!error) { const again = await sb.from("categories").select("id,name,kind").order("name"); if (again.data) categories = again.data; }
  }
  return { categories, methods: (m.data ?? []) as Lookups["methods"] };
};
/** Per request AND per user for 2 minutes: these lists almost never change, so most page loads skip two database round trips. */
export const loadLookups = cache(async (sb: SupabaseClient): Promise<Lookups> => {
  const uid = userIdOf(sb); return uid ? memo(uid, "lookups", 120_000, () => fetchLookups(sb)) : fetchLookups(sb);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
/** Map DB rows to the pure-domain Tx. Payment method code and channel are resolved from lookups. */
export function toTx(r: Row, methods: Lookups["methods"]): Tx {
  const pm = methods.find((m) => m.id === r.payment_method_id);
  return {
    id: r.id, type: r.type, amountMinor: Number(r.amount_minor), occurredAt: r.occurred_at,
    categoryId: r.category_id, merchant: r.merchant, paymentMethod: pm?.code ?? null,
    channel: r.channel ?? pm?.channel ?? null, fromAccountId: r.from_account_id, toAccountId: r.to_account_id,
    refundOfId: r.refund_of_id, direction: r.direction, description: r.description ?? r.name, externalRef: r.external_ref,
  };
}

/** The columns toTx() and the pages actually use. Fetching only these makes big ledgers noticeably faster than select("*"). */
/** Just what budgets/spend-by-category maths needs. */
const SLIM_COLS = "id,type,amount_minor,occurred_at,category_id,payment_method_id,channel,refund_of_id";
const TX_COLS = "id,type,amount_minor,occurred_at,name,merchant,description,category_id,payment_method_id,channel,from_account_id,to_account_id,refund_of_id,direction,external_ref";

/**
 * Loads all non-deleted transactions in [from, to). Pass `to` far in future for open-ended. RLS scopes to the caller.
 * Pages of 1,000 are fetched in parallel once the first page reveals the total (the old sequential loop cost one full round trip per page).
 * `cols`: "slim" = only what budget/category maths needs, "full" = every column (the report export), default = what the pages use.
 */
export async function loadTxs(sb: SupabaseClient, _unused?: unknown, from?: Date, to?: Date, includeRefundOrigins = true, cols: "slim" | "full" | "default" = "default") {
  const lookupsP = loadLookups(sb); const sel = cols === "full" ? "*" : cols === "slim" ? SLIM_COLS : TX_COLS; const PAGE = 1000;
  const page = (off: number, withCount: boolean) => {
    let q = sb.from("transactions").select(sel, withCount ? { count: "exact" } : undefined).is("deleted_at", null).order("occurred_at", { ascending: false }).order("id").range(off, off + PAGE - 1);
    if (from) q = q.gte("occurred_at", from.toISOString());
    if (to) q = q.lt("occurred_at", to.toISOString());
    return q;
  };
  const first = await page(0, true); if (first.error) throw new Error(first.error.message);
  const out: Row[] = [...((first.data ?? []) as unknown as Row[])]; const total = first.count ?? out.length;
  if (total > PAGE) {
    const rest = await Promise.all(Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, false)));
    for (const r of rest) { if (r.error) throw new Error(r.error.message); out.push(...((r.data ?? []) as unknown as Row[])); }
  }
  const { methods, categories } = await lookupsP;
  const txs = out.map((r) => toTx(r, methods));
  if (includeRefundOrigins) {
    const have = new Set(txs.map((t) => t.id));
    const need = [...new Set(txs.filter((t) => t.refundOfId && !have.has(t.refundOfId)).map((t) => t.refundOfId!))];
    if (need.length) { const { data } = await sb.from("transactions").select(cols === "slim" ? SLIM_COLS : TX_COLS).in("id", need); (data ?? []).forEach((r) => txs.push({ ...toTx(r as Row, methods), occurredAt: "1970-01-01T00:00:00Z" })); }
  }
  return { rows: out, txs, lookups: { methods, categories } as Lookups };
}

export interface MerchantOpt { merchant: string; count: number; categoryId?: string; methodId?: string }
/** The people/shops you have paid (or been paid by) most, with the category and payment method you usually use for each. Cached briefly per user. */
export async function loadMerchants(sb: SupabaseClient, type: "expense" | "income"): Promise<MerchantOpt[]> {
  const run = async (): Promise<MerchantOpt[]> => {
    const { data } = await sb.from("transactions").select("merchant,category_id,payment_method_id").eq("type", type).is("deleted_at", null).not("merchant", "is", null).order("occurred_at", { ascending: false }).limit(800);
    const by = new Map<string, { name: string; n: number; cats: Map<string, number>; methods: Map<string, number> }>();
    for (const r of data ?? []) {
      const name = String(r.merchant ?? "").trim(); if (!name) continue; const k = name.toLowerCase(); const e = by.get(k) ?? { name, n: 0, cats: new Map(), methods: new Map() };
      e.n++; if (r.category_id) e.cats.set(r.category_id, (e.cats.get(r.category_id) ?? 0) + 1); if (r.payment_method_id) e.methods.set(r.payment_method_id, (e.methods.get(r.payment_method_id) ?? 0) + 1); by.set(k, e);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 60).map((e) => ({ merchant: e.name, count: e.n, categoryId: top(e.cats), methodId: top(e.methods) }));
  };
  const uid = userIdOf(sb); return uid ? memo(uid, `merchants:${type}`, 60_000, run) : run();
}
