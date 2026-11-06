"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** Re-reads the page every few seconds (at most `max` times). Used while a payment is still being confirmed by the bank/webhook. */
export function AutoRefresh({ every = 4000, max = 15 }: { every?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => { let n = 0; const t = setInterval(() => { if (++n > max) clearInterval(t); else router.refresh(); }, every); return () => clearInterval(t); }, [router, every, max]);
  return null;
}
