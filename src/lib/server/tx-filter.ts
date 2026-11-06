import type { Range } from "@/lib/finance/dates";
import type { SP } from "./range";

/** Every Supabase filter builder (select, update, count) has these methods; typed loosely because the builder's own generics are too deep for TypeScript to follow. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = { is(c: string, v: null): any; gte(c: string, v: string | number): any; lt(c: string, v: string): any; lte(c: string, v: number): any; eq(c: string, v: string): any; or(f: string): any };

/**
 * The filters of the Transactions list (period, type, category, amount range, method, channel, search), applied to any query.
 * The list and "Delete all" both use it, so "all" always means exactly what the list shows.
 */
export function applyTxFilters<T>(query: T, sp: SP, range: Range): T {
  let q: Q = (query as unknown as Q).is("deleted_at", null).gte("occurred_at", range.start.toISOString()).lt("occurred_at", range.end.toISOString());
  if (sp.type) q = q.eq("type", sp.type);
  if (sp.cat) q = q.eq("category_id", sp.cat);
  const minR = Number(sp.min), maxR = Number(sp.max);
  if (sp.min && minR >= 0) q = q.gte("amount_minor", Math.round(minR * 100));
  if (sp.max && maxR >= 0) q = q.lte("amount_minor", Math.round(maxR * 100));
  if (sp.method) q = q.eq("payment_method_id", sp.method);
  if (sp.channel) q = q.eq("channel", sp.channel);
  if (sp.q) { const s = sp.q.replace(/[%_,()]/g, " ").trim().slice(0, 100); if (s) q = q.or(`name.ilike.%${s}%,merchant.ilike.%${s}%,description.ilike.%${s}%`); }
  return q as unknown as T;
}
