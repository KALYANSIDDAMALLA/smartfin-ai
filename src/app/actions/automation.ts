"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { loadLookups } from "@/lib/server/data";
import { askJson } from "@/lib/server/ai";
import { answerQuestion } from "@/lib/server/assistant";
import { personSuggestion, suggestFromHistory, suggestFromRules } from "@/lib/finance/suggest";

export interface CatProposal { id: string; label: string; amountMinor: number; type: string; categoryId: string; categoryName: string; confidence: number; source: "history" | "rules" | "ai" }

/** Proposes categories for uncategorised transactions (history → rules → AI). Nothing is changed until the user applies. */
export async function previewAutoCategorize(): Promise<{ proposals: CatProposal[]; total: number; error?: string }> {
  const a = await getUserOrNull(); if (!a) return { proposals: [], total: 0, error: "Please log in again." };
  if (!rateLimit(`autocat:${a.user.id}`, 10, 10 * 60_000).ok) return { proposals: [], total: 0, error: "Too many requests. Try again shortly." };
  const [lookups, unc, hist] = await Promise.all([
    loadLookups(a.supabase),
    a.supabase.from("transactions").select("id,name,merchant,type,amount_minor").is("category_id", null).in("type", ["expense", "income"]).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(100),
    a.supabase.from("transactions").select("merchant,name,category_id,payment_method_id,channel,type").not("category_id", "is", null).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(800),
  ]);
  const rows = unc.data ?? []; const catById = new Map(lookups.categories.map((c) => [c.id, c]));
  const out: CatProposal[] = []; const leftover: typeof rows = [];
  for (const r of rows) {
    const text = r.merchant || r.name || ""; const kind = r.type as "expense" | "income";
    const past = (hist.data ?? []).filter((h) => h.type === kind).map((h) => ({ merchant: h.merchant, name: h.name, categoryId: h.category_id }));
    const s = suggestFromHistory(past, text) ?? suggestFromRules(text, lookups.categories, kind) ?? personSuggestion(text, lookups.categories, kind);
    if (s?.categoryId) out.push({ id: r.id, label: text || "(no name)", amountMinor: Number(r.amount_minor), type: r.type, categoryId: s.categoryId, categoryName: catById.get(s.categoryId)?.name ?? "", confidence: s.confidence, source: s.source === "ai" ? "ai" : s.source });
    else if (text.trim().length >= 3) leftover.push(r);
  }
  // One batched AI call for the rest (text + category names only; no amounts or ids).
  const batch = leftover.slice(0, 20);
  if (batch.length) {
    const names = { expense: lookups.categories.filter((c) => c.kind === "expense").map((c) => c.name), income: lookups.categories.filter((c) => c.kind === "income").map((c) => c.name) };
    const Pick = z.object({ items: z.array(z.object({ i: z.number().int(), category: z.string().nullable(), confidence: z.number().min(0).max(1) })).max(20) });
    const ai = await askJson('For each numbered item choose EXACTLY one category name from the list for its kind, or null if unsure. Return JSON {"items":[{"i":number,"category":string|null,"confidence":number 0-1}]}.', { items: batch.map((r, i) => ({ i, text: r.merchant || r.name, kind: r.type })), categories: names }, Pick, 600);
    for (const it of ai?.value.items ?? []) { const r = batch[it.i]; if (!r || !it.category) continue; const cat = lookups.categories.find((c) => c.kind === r.type && c.name.toLowerCase() === it.category!.toLowerCase()); if (cat) out.push({ id: r.id, label: r.merchant || r.name || "", amountMinor: Number(r.amount_minor), type: r.type, categoryId: cat.id, categoryName: cat.name, confidence: Math.min(0.8, it.confidence), source: "ai" }); }
  }
  return { proposals: out, total: rows.length };
}

const Apply = z.array(z.object({ id: z.string().uuid(), categoryId: z.string().uuid() })).max(200);
/** Applies approved proposals. Ownership is enforced by RLS; the category must also match the transaction's kind. */
export async function applyCategories(items: { id: string; categoryId: string }[]): Promise<{ applied: number; error?: string }> {
  const a = await getUserOrNull(); if (!a) return { applied: 0, error: "Please log in again." };
  const p = Apply.safeParse(items); if (!p.success) return { applied: 0, error: "Invalid selection." };
  const lookups = await loadLookups(a.supabase); let n = 0;
  for (const it of p.data) {
    const cat = lookups.categories.find((c) => c.id === it.categoryId); if (!cat) continue;
    const { data: tx } = await a.supabase.from("transactions").select("type").eq("id", it.id).maybeSingle(); if (!tx || (tx.type === "income") !== (cat.kind === "income")) continue;
    const { error } = await a.supabase.from("transactions").update({ category_id: it.categoryId }).eq("id", it.id); if (!error) n++;
  }
  revalidatePath("/transactions"); revalidatePath("/dashboard"); return { applied: n };
}

/** Floating "Ask AI": answers from verified calculations; nothing is stored. */
export async function quickAsk(question: string): Promise<{ text?: string; period?: string; error?: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`quickask:${a.user.id}`, 30, 60 * 60_000).ok) return { error: "Question limit reached. Try again later." };
  const q = String(question ?? "").trim().slice(0, 300); if (q.length < 3) return { error: "Ask a question." };
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).maybeSingle();
  try { const r = await answerQuestion(a.supabase, prof?.timezone ?? "Asia/Kolkata", q); return { text: r.text, period: r.period }; } catch { return { error: "Could not answer right now." }; }
}
