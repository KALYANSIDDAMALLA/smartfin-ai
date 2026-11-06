import { parseMoney } from "../finance/money";
import type { SmsResult } from "./sms";

/** What the AI is asked to extract. Every field is optional and is VERIFIED here before use — the AI is never trusted for numbers. */
export interface AiExtract { type?: "expense" | "income" | null; amount?: number | string | null; date?: string | null; merchant?: string | null; description?: string | null; method?: string | null; category?: string | null; reference?: string | null; name?: string | null; time?: string | null; tags?: string[] | null }
export interface SmartCtx { today: string; methods: { id: string; code: string; label: string; channel: "online" | "offline" }[]; categories: { id: string; name: string; kind: string }[] }
export interface Clean { type?: "expense" | "income"; amount?: string; date?: string; merchant?: string; description?: string; methodId?: string; channel?: "online" | "offline"; categoryId?: string; ref?: string; name?: string; time?: string; tags?: string[] }
/** Extras from the built-in readers (free text / bank alert) that the AI may refine. */
export interface Extras { name?: string; description?: string; tags?: string[]; time?: string; noteText?: string }
export interface SmartResult {
  ok: boolean; reason?: string; type?: "expense" | "income"; amount?: string; date?: string; merchant?: string; description?: string;
  methodId?: string; channel?: "online" | "offline"; categoryId?: string; ref?: string; confidence: "high" | "medium" | "low"; usedAI: boolean; notes: string[];
  name?: string; time?: string; tags?: string; noteText?: string; /** names of the form fields that were filled, for highlighting */ filled?: string[];
}

const nums = (t: string) => new Set((t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, "")))));
const validYmd = (d: string, today: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const t = Date.parse(d + "T00:00:00Z"); if (isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return false;
  const now = Date.parse(today + "T00:00:00Z"); return t <= now + 864e5 && t >= now - 5 * 365 * 864e5; // not in the future, not ancient
};
const clip = (s: string | null | undefined, n: number) => { const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, n); return v || undefined; };

/** Keeps only fields that can be verified against the user's text and data. */
export function validateExtract(ai: AiExtract | null, text: string, ctx: SmartCtx): Clean {
  const out: Clean = {}; if (!ai) return out;
  if (ai.type === "expense" || ai.type === "income") out.type = ai.type;
  if (ai.amount != null && ai.amount !== "") {
    try { const m = parseMoney(String(ai.amount).replace(/[^\d.,]/g, "")); // the amount must literally occur in what the user pasted/typed
      if (m > 0 && m <= 100_000_000_000 && nums(text).has(String(m / 100)) ) out.amount = (m / 100).toFixed(2); } catch { /* ignore */ }
  }
  if (ai.date && validYmd(ai.date, ctx.today)) out.date = ai.date;
  out.merchant = clip(ai.merchant, 80); out.description = clip(ai.description, 200);
  const method = ai.method ? ctx.methods.find((m) => m.code === ai.method) : undefined; if (method) { out.methodId = method.id; out.channel = method.channel; }
  const kind = out.type === "income" ? "income" : "expense";
  const cat = ai.category ? ctx.categories.find((c) => c.kind === kind && c.name.toLowerCase() === ai.category!.toLowerCase()) : undefined; if (cat) out.categoryId = cat.id;
  const ref = clip(ai.reference, 40); if (ref && text.includes(ref)) out.ref = ref;
  out.name = clip(ai.name, 80);
  if (ai.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(ai.time)) out.time = ai.time;
  const tags = (ai.tags ?? []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-")).filter((t) => t.length >= 2 && t.length <= 24);
  if (tags.length) out.tags = [...new Set(tags)].slice(0, 5);
  return out;
}

/**
 * Deterministic reader result (`local`) wins for amount/date/reference whenever it found them; the AI fills what the regexes can't
 * (free text, merchant names, method, description, category). If the local reader failed, a fully verified AI result can stand in (medium confidence).
 */
export function mergeSmart(local: SmsResult, ai: Clean, ctx: SmartCtx, extra: Extras = {}): SmartResult {
  const notes: string[] = []; const localMethod = local.ok && local.methodCode ? ctx.methods.find((m) => m.code === local.methodCode) : undefined;
  const finish = (r: SmartResult): SmartResult => {
    const tags = [...new Set([...(ai.tags ?? []), ...(extra.tags ?? [])])].slice(0, 6).join(", ") || undefined;
    const name = ai.name ?? extra.name ?? r.merchant; const description = r.description ?? extra.description; const time = extra.time ?? ai.time;
    const out: SmartResult = { ...r, name, description, tags, time, noteText: extra.noteText };
    const filled = ["amount", "date", time && "time", name && "name", r.merchant && "merchant", r.categoryId && "category", r.methodId && "method", r.channel && "channel", tags && "tags", description && "description", extra.noteText && "notes"].filter(Boolean) as string[];
    return { ...out, filled };
  };
  if (local.ok) {
    const usedAI = !!(ai.merchant || ai.methodId || ai.description || ai.categoryId || ai.name || ai.tags?.length || (!local.date && ai.date));
    if (ai.amount && ai.amount !== local.amount) notes.push("AI read a different amount; kept the one found by the exact reader.");
    const merchant = local.merchant ?? ai.merchant; const m = localMethod ?? ctx.methods.find((x) => x.id === ai.methodId);
    const date = local.date ?? ai.date;
    const score = (merchant ? 1 : 0) + (date ? 1 : 0) + (m ? 1 : 0);
    return finish({ ok: true, type: local.type, amount: local.amount, date, merchant, description: ai.description, methodId: m?.id, channel: local.channel ?? m?.channel, categoryId: ai.categoryId, ref: local.ref ?? ai.ref,
      confidence: score >= 3 ? "high" : score >= 2 ? "medium" : "low", usedAI, notes });
  }
  // Local reader could not understand the text: accept the AI only if the essentials were verified.
  if (ai.type && ai.amount) {
    return finish({ ok: true, type: ai.type, amount: ai.amount, date: ai.date, merchant: ai.merchant, description: ai.description, methodId: ai.methodId, channel: ai.channel, categoryId: ai.categoryId, ref: ai.ref,
      confidence: ai.date && (ai.merchant || ai.methodId) ? "medium" : "low", usedAI: true, notes: ["Read by AI from free text — please check every field."] });
  }
  return { ok: false, reason: local.reason ?? "Couldn't understand that text.", confidence: "low", usedAI: false, notes };
}
