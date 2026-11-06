"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "./ui";

const show = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");

/**
 * A date box that looks the same everywhere: always shows "dd/mm/yyyy" (or the chosen date) and a calendar icon.
 * iPhone Safari draws an empty date input as a blank box and ignores width limits, so the visible part is plain text and the real
 * <input type="date"> sits invisibly on top of it: tapping anywhere opens the phone's own date picker.
 * Two ways to use it: as a form field (`name` + `defaultValue`, submitted with the form), or controlled (`value` + `onValueChange`).
 */
export function DateBox({ name, label, defaultValue, value, onValueChange, min, max, required, disabled, className }: {
  name?: string; label: string; defaultValue?: string; value?: string; onValueChange?: (v: string) => void; min?: string; max?: string; required?: boolean; disabled?: boolean; className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? ""); const v = value ?? inner;
  return (
    <div className={cn("relative flex h-11 min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-line bg-surface px-3 text-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 sm:h-10", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", className)}>
      <span className={cn("truncate", v ? "text-fg" : "text-muted")}>{show(v) || "dd/mm/yyyy"}</span>
      <CalendarDays size={16} aria-hidden className="shrink-0 text-muted" />
      <input type="date" name={name} aria-label={label} required={required} disabled={disabled} min={min} max={max} value={v}
        onChange={(e) => { setInner(e.target.value); onValueChange?.(e.target.value); }}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* some browsers only allow it from a real tap: the native input handles that */ } }}
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed" />
    </div>
  );
}
