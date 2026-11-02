"use client";
import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

// One shared ticking store: SSR and the first client paint render an empty placeholder (no hydration mismatch), then it ticks every second.
const listeners = new Set<() => void>(); let timer: ReturnType<typeof setInterval> | undefined;
const subscribe = (cb: () => void) => {
  listeners.add(cb); timer ??= setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => { listeners.delete(cb); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
};
const snapshot = () => Math.floor(Date.now() / 1000);

/** Today's date and a live clock in the user's timezone (default Asia/Kolkata). */
export function LiveClock({ timezone = "Asia/Kolkata" }: { timezone?: string }) {
  const secs = useSyncExternalStore(subscribe, snapshot, () => 0);
  if (!secs) return <div className="h-9 w-40 xl:w-72" aria-hidden />;
  const d = new Date(secs * 1000);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(d).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-surface2/40 px-3 py-1.5" title={`Your timezone: ${timezone}`}>
      <Clock size={16} className="shrink-0 text-brand" aria-hidden />
      <div className="flex items-baseline gap-2.5 whitespace-nowrap"><p className="tabnum text-sm font-semibold" aria-label="Current time">{time}</p>
        <span className="hidden h-3.5 w-px self-center bg-line xl:block" aria-hidden /><p className="hidden text-xs text-muted xl:block" aria-label="Today's date">{date}</p></div>
    </div>
  );
}
