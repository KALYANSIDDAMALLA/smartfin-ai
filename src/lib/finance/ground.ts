/**
 * Accuracy guard for AI text. The model may only quote numbers that the analysis engine produced; any sentence that mentions a rupee
 * amount or a percentage the engine did not compute is dropped (callers then fall back to the deterministic wording).
 */

/** Every number found anywhere inside `data` (nested objects and arrays). */
export function collectNumbers(data: unknown, out: number[] = []): number[] {
  if (typeof data === "number" && Number.isFinite(data)) out.push(data);
  else if (Array.isArray(data)) data.forEach((x) => collectNumbers(x, out));
  else if (data && typeof data === "object") Object.values(data).forEach((x) => collectNumbers(x, out));
  return out;
}

const UNIT: Record<string, number> = { k: 1e3, lakh: 1e5, lakhs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7 };
const RUPEE = /(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(lakhs?|crores?|cr|k|l)\b)?/gi;
const PCT = /(\d+(?:\.\d+)?)\s?%/g;

/** Rupee amounts mentioned in the text, as rupees. */
export function rupeeMentions(text: string): number[] {
  return [...text.matchAll(RUPEE)].map((m) => parseFloat(m[1].replace(/,/g, "")) * (m[2] ? UNIT[m[2].toLowerCase()] : 1)).filter((n) => Number.isFinite(n));
}
export const percentMentions = (text: string): number[] => [...text.matchAll(PCT)].map((m) => parseFloat(m[1])).filter((n) => Number.isFinite(n));

export interface Allowed { rupees: number[]; percents: number[] }
/** `data` holds paise (money) and plain percents; the allowed rupee set is every number / 100, the percent set is every number. */
export function allowedFrom(data: unknown): Allowed { const n = collectNumbers(data); return { rupees: n.map((x) => x / 100), percents: n }; }

const near = (v: number, set: number[], rel: number, abs: number) => set.some((a) => Math.abs(a - v) <= Math.max(abs, Math.abs(a) * rel));

/** True when every ₹ amount and % in the sentence is backed by the analysis (1% / ₹1 tolerance for rounding; percents ±1). */
export function isGrounded(sentence: string, ok: Allowed): boolean {
  return rupeeMentions(sentence).every((r) => r < 1 || near(r, ok.rupees, 0.01, 1)) && percentMentions(sentence).every((p) => p <= 100 && near(p, ok.percents, 0, 1));
}

/** Keeps only grounded sentences; returns "" when nothing is left. */
export function groundText(text: string, ok: Allowed): string {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() && isGrounded(s, ok)).join(" ").trim();
}
