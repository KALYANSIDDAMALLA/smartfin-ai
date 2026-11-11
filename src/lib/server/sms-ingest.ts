import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBankMessage } from "@/lib/imports/sms";
import { parseDate } from "@/lib/imports/parse";
import { detectDuplicates } from "@/lib/imports/dedupe";
import { localDate } from "@/lib/finance/dates";
import { personSuggestion, suggestFromHistory, suggestFromRules } from "@/lib/finance/suggest";
import { notify } from "./notify";

export const TOKEN_RE = /^sfn_[A-Za-z0-9_-]{20,64}$/;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => `sfn_${randomBytes(24).toString("base64url")}`;

export type IngestResult = { status: "staged" | "duplicate" | "ignored"; reason?: string; batchId?: string };

/**
 * Stages one forwarded bank SMS for the user's review. Uses the service-role client, so EVERY query below is filtered by userId explicitly
 * (the id comes from the verified token, never from the request body). Nothing is written to the ledger: the user confirms in Imports.
 */
export async function ingestSms(userId: string, message: string): Promise<IngestResult> {
  const text = message.replace(/\s+/g, " ").trim().slice(0, 1000);
  const r = parseBankMessage(text);
  if (!r.ok || !r.amount || !r.type) return { status: "ignored", reason: r.reason ?? "Not a transaction message." };
  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("timezone").eq("id", userId).maybeSingle(); const tz = prof?.timezone ?? "Asia/Kolkata";
  const now = new Date();
  const occurredAt = !r.date || r.date === localDate(now.toISOString(), tz) ? now.toISOString() : (parseDate(r.date, tz) ?? now.toISOString()); // an alert arrives right away: "today" means now
  const amountMinor = Math.round(Number(r.amount) * 100);
  const externalRef = r.ref ?? `sms:${createHash("sha256").update(`${amountMinor}|${text}`).digest("hex").slice(0, 24)}`; // same message retried by the phone = same ref
  const description = (r.merchant ?? "Bank SMS").slice(0, 300);

  // Retries of the same alert, or something already imported/confirmed with that reference: ignore quietly (idempotent).
  const [{ data: stagedSame }, { data: ledgerSame }] = await Promise.all([
    db.from("staged_import_transactions").select("id").eq("user_id", userId).eq("external_ref", externalRef).limit(1),
    db.from("transactions").select("id").eq("user_id", userId).eq("external_ref", externalRef).is("deleted_at", null).limit(1),
  ]);
  if (stagedSame?.length || ledgerSame?.length) return { status: "duplicate", reason: "Already received." };

  // Same day + amount + payee already in the ledger: stage it flagged (unticked) so a real repeat purchase isn't lost.
  const t = occurredAt; const from = new Date(Date.parse(t) - 2 * 864e5).toISOString(), to = new Date(Date.parse(t) + 3 * 864e5).toISOString();
  const { data: near } = await db.from("transactions").select("amount_minor,occurred_at,merchant,description,external_ref").eq("user_id", userId).is("deleted_at", null).gte("occurred_at", from).lt("occurred_at", to).limit(500);
  const dup = detectDuplicates([{ amountMinor, occurredAt, description, externalRef }], (near ?? []).map((n) => ({ amountMinor: Number(n.amount_minor), occurredAt: n.occurred_at, merchant: n.merchant ?? n.description, externalRef: n.external_ref })), tz)[0];

  const [{ data: cats }, { data: hist }] = await Promise.all([
    db.from("categories").select("id,name,kind").eq("user_id", userId),
    db.from("transactions").select("merchant,name,category_id,type").eq("user_id", userId).not("category_id", "is", null).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(800),
  ]);
  const kind = r.type; const cl = cats ?? [];
  const past = (hist ?? []).filter((h) => h.type === kind).map((h) => ({ merchant: h.merchant, name: h.name, categoryId: h.category_id }));
  const categoryId = (suggestFromHistory(past, description) ?? suggestFromRules(description, cl, kind) ?? personSuggestion(description, cl, kind))?.categoryId ?? null;

  // One open "Instant SMS alerts" batch collects alerts until the user confirms it; the next alert then starts a new one.
  let { data: batch } = await db.from("import_batches").select("id").eq("user_id", userId).eq("file_kind", "sms").eq("status", "preview").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!batch) {
    const id = randomUUID();
    const { error } = await db.from("import_batches").insert({ id, user_id: userId, file_name: "Instant SMS alerts", file_kind: "sms", storage_path: `sms:${id}`, size_bytes: 1, status: "preview" });
    if (error) throw new Error(error.message); batch = { id };
  }
  const { count } = await db.from("staged_import_transactions").select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
  const { error } = await db.from("staged_import_transactions").insert({
    user_id: userId, batch_id: batch.id, row_index: count ?? 0, raw: { sms: text }, amount_minor: amountMinor, occurred_at: occurredAt, merchant: r.merchant ?? null, description,
    tx_type: r.type, category_id: categoryId, external_ref: externalRef, confidence: r.confidence === "high" ? 0.95 : r.confidence === "medium" ? 0.75 : 0.55, is_duplicate: dup.duplicate, duplicate_reason: dup.reason ?? null, include: !dup.duplicate,
  });
  if (error) throw new Error(error.message);
  await notify(userId, "import", "New bank alert to review", `${r.type === "income" ? "+" : "-"}₹${r.amount}${r.merchant ? ` · ${r.merchant}` : ""}. Open Imports to confirm.`);
  return { status: "staged", batchId: batch.id };
}
