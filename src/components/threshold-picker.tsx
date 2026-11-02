"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "./ui";

const COMMON = [25, 50, 75, 90, 100, 120];
/** Tap-to-select alert levels (% of a budget's limit). Submits as a comma list in a hidden input, which the server already understands. */
export function ThresholdPicker({ name, defaultValue }: { name: string; defaultValue: number[] }) {
  const [on, setOn] = useState<number[]>([...new Set(defaultValue)].sort((a, b) => a - b));
  const levels = [...new Set([...COMMON, ...defaultValue])].sort((a, b) => a - b);
  const toggle = (n: number) => setOn((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n].sort((a, b) => a - b)));
  return (
    <div role="group" aria-label="Alert levels" className="flex flex-wrap gap-2">
      <input type="hidden" name={name} value={on.join(",")} />
      {levels.map((n) => { const sel = on.includes(n);
        return (
          <button key={n} type="button" role="checkbox" aria-checked={sel} onClick={() => toggle(n)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition", sel ? "border-brand bg-brand/12 text-brand shadow-sm" : "border-line bg-surface/70 text-muted hover:border-brand/50 hover:text-fg")}>
            {sel && <Check size={14} aria-hidden />}{n}%
          </button>); })}
    </div>
  );
}
