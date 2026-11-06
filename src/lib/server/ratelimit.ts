import "server-only";
// In-memory sliding window. Per-instance only: on Vercel (multi-instance) swap for Upstash/Redis. Documented in docs/KNOWN_LIMITATIONS.md.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - arr[0])) / 1000) }; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryAfterSec: 0 };
}
