"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Starts the reminders in the background once the page is on screen, so no page waits for them. Refreshes only if new notifications appeared. */
export function RemindersTrigger({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetch("/api/reminders", { method: "POST", cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
        .then((d: { unread?: number } | null) => { if (live && d && typeof d.unread === "number" && d.unread > unread) router.refresh(); })
        .catch(() => { /* reminders are best-effort */ });
    }, 800); // let the page paint and settle first
    return () => { live = false; clearTimeout(t); };
  }, [unread, router]);
  return null;
}
