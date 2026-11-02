import "server-only";

/**
 * Tiny per-user, in-process cache for data that is read on every page load but rarely changes (profile, category lists, unread count).
 * Keys always start with the VERIFIED user id, and values are read through that user's own RLS-scoped client, so one user can never be served another's data.
 * Entries expire quickly and are dropped explicitly (forgetUser) when the user changes them. Concurrent callers share one in-flight read.
 */
type Entry = { value?: unknown; exp: number; pending?: Promise<unknown> };
const store = new Map<string, Entry>(); const MAX = 2000;

export async function memo<T>(uid: string, name: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const key = `${uid}:${name}`; const hit = store.get(key); const now = Date.now();
  if (hit && hit.exp > now) return (hit.pending ?? hit.value) as T;
  if (store.size >= MAX) for (const [k, e] of store) { if (e.exp <= now) store.delete(k); if (store.size < MAX * 0.8) break; }
  const pending = load().then((value) => { store.set(key, { value, exp: Date.now() + ttlMs }); return value; }, (err) => { store.delete(key); throw err; });
  store.set(key, { exp: now + ttlMs, pending });
  return pending;
}
/** Drop a user's cached entries (call after they change their profile, avatar or notifications). */
export function forgetUser(uid: string) { for (const k of store.keys()) if (k.startsWith(uid + ":")) store.delete(k); }
