import { parseBankMessage } from "./sms";
import { findTime, parseFreeText } from "./freetext";
import { personFallback, suggestFromRules } from "../finance/suggest";
import { describeAlert } from "./describe";
import type { SmartResult } from "./smart";

export interface InstantCtx { today: string; methods: { id: string; code: string; label: string; channel: "online" | "offline" }[]; categories: { id: string; name: string; kind: string }[] }

/**
 * Immediate, offline read used the moment text is pasted: the bank-alert reader, then the plain-English reader, plus built-in category rules.
 * The server's smartRead (history + optional AI) replaces this a moment later with a richer result.
 */
export function instantRead(text: string, mode: "expense" | "income", ctx: InstantCtx): SmartResult {
  const t = text.replace(/\s+/g, " ").trim(); const bank = parseBankMessage(t); const free = parseFreeText(t, ctx.today, mode);
  const base = bank.ok ? bank : free.ok ? { ok: true as const, type: free.type, amount: free.amount, date: free.date, merchant: free.merchant, methodCode: free.methodCode, channel: free.channel, ref: free.ref, confidence: free.confidence } : null;
  if (!base) return { ok: false, reason: bank.reason ?? free.reason ?? "Couldn't understand that text.", confidence: "low", usedAI: false, notes: [] };
  const method = base.methodCode ? ctx.methods.find((m) => m.code === base.methodCode) : undefined; const type = base.type ?? mode;
  const name = free.ok ? (bank.ok ? free.purpose ?? bank.merchant : free.name) : base.merchant; const time = free.ok ? free.time : findTime(t);
  const cat = [base.merchant, name, t].map((q) => (q ? suggestFromRules(q, ctx.categories, type) : null)).find((c) => c?.categoryId) ?? null; // merchant first, then the purpose, then the whole text
  const person = !cat?.categoryId ? personFallback(ctx.categories, type, base.merchant) : null; const categoryId = cat?.categoryId ?? person?.categoryId;
  const date = base.date ?? (time ? ctx.today : undefined);
  const facts = bank.ok ? describeAlert(t, { type, merchant: base.merchant, methodCode: base.methodCode, methodLabel: method?.label }) : { description: undefined, tags: [] as string[] };
  const tagList = [...new Set([...free.tags, ...facts.tags])].slice(0, 5); const tags = tagList.length ? tagList.join(", ") : undefined; const description = facts.description;
  const noteText = `Pasted: ${t.replace(/\d{9,}/g, (n) => "…" + n.slice(-4)).slice(0, 380)}`;
  const filled = ["amount", date && "date", time && "time", name && "name", base.merchant && "merchant", categoryId && "category", method && "method", (base.channel ?? method?.channel) && "channel", tags && "tags", description && "description", "notes"].filter(Boolean) as string[];
  return { ok: true, type, amount: base.amount, date, time, merchant: base.merchant, name, methodId: method?.id, channel: base.channel ?? method?.channel, categoryId, ref: base.ref, tags, description, noteText, filled,
    confidence: base.confidence, usedAI: false, notes: person ? [person.reason] : [] };
}
