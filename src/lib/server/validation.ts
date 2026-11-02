import { z } from "zod";
import { parseMoney } from "@/lib/finance/money";
import { checkAmount, checkDate, checkName, checkNote, checkReference, cleanMultiline, cleanText, normalizeTags } from "@/lib/validate";

/** Amount in paise; the message says exactly what is wrong (see lib/validate). */
export const moneyField = z.string().transform((v, ctx) => {
  const e = checkAmount(v); if (e) { ctx.addIssue({ code: "custom", message: e }); return z.NEVER; }
  return parseMoney(cleanText(v));
});
/** Cleaned, validated single-line text field (empty -> undefined). */
export const nameField = (label: string, o?: Parameters<typeof checkName>[2]) => z.string().optional().transform((v, ctx) => {
  const raw = v ?? ""; const e = checkName(label, raw, o); if (e) { ctx.addIssue({ code: "custom", message: e }); return z.NEVER; } return cleanText(raw) || undefined;
});
export const noteField = (label: string, max: number) => z.string().optional().transform((v, ctx) => {
  const raw = v ?? ""; const e = checkNote(label, raw, max); if (e) { ctx.addIssue({ code: "custom", message: e }); return z.NEVER; } return cleanMultiline(raw) || undefined;
});
const optId = z.string().uuid().optional().or(z.literal("").transform(() => undefined));
const optText = (n = 500) => z.string().trim().max(n).optional().transform((v) => v || undefined);

export const txSchema = z.object({
  type: z.enum(["income", "expense", "transfer", "refund", "adjustment"]),
  amount: moneyField,
  occurredAt: z.string().transform((v, ctx) => { const e = checkDate(v); if (e) { ctx.addIssue({ code: "custom", message: e }); return z.NEVER; } return new Date(v).toISOString(); }),
  name: nameField("Name", { max: 100 }), merchant: nameField("Merchant / recipient", { payee: true }), description: noteField("Description", 1000), notes: noteField("Notes", 2000),
  externalRef: z.string().optional().transform((v, ctx) => { const e = checkReference(v ?? ""); if (e) { ctx.addIssue({ code: "custom", message: e }); return z.NEVER; } return cleanText(v ?? "") || undefined; }), subcategory: optText(100),
  categoryId: optId, paymentMethodId: optId, fromAccountId: optId, toAccountId: optId, refundOfId: optId,
  channel: z.enum(["online", "offline"]).optional().or(z.literal("").transform(() => undefined)),
  direction: z.enum(["in", "out"]).optional().or(z.literal("").transform(() => undefined)),
  tags: z.string().optional().transform((v, ctx) => { const r = normalizeTags(v ?? ""); if (r.error) { ctx.addIssue({ code: "custom", message: r.error }); return z.NEVER; } return r.tags; }),
});
export const budgetSchema = z.object({
  name: nameField("Name", { max: 100, required: true }).transform((v) => v as string), period: z.enum(["daily", "weekly", "monthly", "yearly"]), amount: moneyField,
  categoryId: optId, channel: z.enum(["online", "offline"]).optional().or(z.literal("").transform(() => undefined)),
  thresholds: z.string().optional().transform((v) => { const a = (v ?? "50,75,90,100").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 200); return a.length ? [...new Set(a)].sort((x, y) => x - y) : [50, 75, 90, 100]; }),
});
export const goalSchema = z.object({
  name: nameField("Name", { max: 100, required: true }).transform((v) => v as string), kind: z.string().max(40).default("custom"), description: noteField("Description", 1000),
  target: moneyField, targetDate: z.string().optional().transform((v) => v || undefined),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional().or(z.literal("").transform(() => undefined)),
});
export const recurringSchema = z.object({
  name: nameField("Name", { max: 100, required: true }).transform((v) => v as string), txType: z.enum(["income", "expense"]), amount: moneyField,
  categoryId: optId, paymentMethodId: optId, frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]), nextDue: z.string().min(1),
});
export const FILE_LIMIT = 10 * 1024 * 1024;
