"use client";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; };

/** A small per-browser preference (e.g. sidebar collapsed). SSR-safe: the server and first paint use `fallback`; storage failures are ignored. */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, () => fallback);
  const set = (v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode etc.: the preference just won't persist */ } listeners.forEach((l) => l()); };
  return [value, set];
}
