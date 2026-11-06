"use client";
import { useRef } from "react";
import { cn } from "./ui";

/** Six separate digit boxes: typing moves forward, Backspace moves back, pasting a whole code fills every box. `onEnter` fires on Enter. */
export function OtpBoxes({ value, onChange, label, disabled, error, onEnter }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean; error?: boolean; onEnter?: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const set = (next: string) => onChange(next.replace(/\D/g, "").slice(0, 6));
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus();
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} disabled={disabled} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} aria-label={`${label}, digit ${i + 1}`} aria-invalid={error || undefined}
          onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); if (!c) return; const arr = digits.slice(); arr[i] = c.slice(-1); set(arr.join("")); focus(i + 1); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") { e.preventDefault(); const arr = digits.slice(); if (arr[i]) arr[i] = ""; else if (i > 0) { arr[i - 1] = ""; focus(i - 1); } onChange(arr.join("").slice(0, 6)); }
            else if (e.key === "ArrowLeft") focus(i - 1); else if (e.key === "ArrowRight") focus(i + 1);
            else if (e.key === "Enter") { e.preventDefault(); onEnter?.(); }
          }}
          onPaste={(e) => { const t = e.clipboardData.getData("text").replace(/\D/g, ""); if (t) { e.preventDefault(); set(t); focus(t.length); } }}
          onFocus={(e) => e.currentTarget.select()}
          className={cn("h-11 w-full min-w-0 rounded-lg border bg-surface/70 text-center text-lg font-semibold tabnum backdrop-blur-sm transition focus:bg-surface disabled:cursor-not-allowed disabled:opacity-50", error ? "border-bad" : "border-line")} />
      ))}
    </div>
  );
}
