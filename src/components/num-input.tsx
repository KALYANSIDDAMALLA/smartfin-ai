"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cn, inputCls } from "./ui";

/** Indian digit grouping: 1234567 -> 12,34,567 (decimals untouched). */
export function groupIndian(int: string): string { const d = int.replace(/^0+(?=\d)/, ""); return d.length <= 3 ? d : d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + d.slice(-3); }

export type NumMode = "money" | "decimal" | "int" | "list";
/** Keeps only what the mode allows: digits (+ one dot, limited decimals) and, for money, Indian commas. Letters and symbols can never stay in the box. */
export function sanitizeNumber(raw: string, mode: NumMode): string {
  if (mode === "int") return raw.replace(/\D/g, "").slice(0, 9);
  if (mode === "list") return raw.replace(/[^\d,]/g, "").replace(/,{2,}/g, ",").replace(/^,/, "").slice(0, 40);
  raw = raw.replace(/^\s*(?:rs\.?|inr|₹|rupees?)\s*/i, ""); // a pasted currency prefix ("Rs. 1,250") must not leave a stray decimal point
  const [a, ...rest] = raw.replace(/[^\d.]/g, "").split("."); const dot = raw.replace(/[^\d.]/g, "").includes("."); const int = a.slice(0, 12); const dec = rest.join("").slice(0, mode === "money" ? 2 : 4);
  const head = mode === "money" ? groupIndian(int) : int.replace(/^0+(?=\d)/, ""); return dot ? `${head || "0"}.${dec}` : head;
}
const significant = (s: string) => (s.match(/[\d.]/g) ?? []).length; // digits and the dot: the characters whose position matters for the caret

/**
 * Number-only input. Letters and symbols are rejected as you type or paste. In "money" mode (₹) commas are added as you type in the Indian
 * style (12,34,567.50); "decimal" and "int" are plain numbers; "list" is comma-separated whole numbers (e.g. 50,75,90,100).
 * The submitted value still contains the commas; the server strips them.
 */
export function NumInput({ mode = "money", name, value, defaultValue, onValueChange, onChange, className, placeholder, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type" | "inputMode" | "maxLength"> & {
  mode?: NumMode; value?: string; defaultValue?: string | number; onValueChange?: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null); const caret = useRef<number | null>(null);
  const [inner, setInner] = useState(() => sanitizeNumber(String(defaultValue ?? ""), mode)); const controlled = value !== undefined; const shown = controlled ? sanitizeNumber(value, mode) : inner;
  useLayoutEffect(() => { if (caret.current != null && ref.current) { ref.current.setSelectionRange(caret.current, caret.current); caret.current = null; } }); // restore the cursor after re-formatting
  const input = (
    <input ref={ref} name={name} value={shown} placeholder={placeholder} inputMode={mode === "int" || mode === "list" ? "numeric" : "decimal"} autoComplete="off" {...rest}
      className={cn(inputCls, mode === "money" && "pl-7", className)}
      onChange={(e) => {
        const el = e.target; const next = sanitizeNumber(el.value, mode); const pos = el.selectionStart ?? el.value.length; const keep = significant(el.value.slice(0, pos));
        // find the caret position in the formatted text that has the same number of digits/dot before it
        let at = 0, seen = 0; if (mode === "int" || mode === "list") at = Math.min(sanitizeNumber(el.value.slice(0, pos), mode).length, next.length); else { while (at < next.length && seen < keep) { if (/[\d.]/.test(next[at])) seen++; at++; } }
        caret.current = at; if (!controlled) setInner(next); onValueChange?.(next); onChange?.(e);
      }} />
  );
  return mode === "money" ? <div className="relative"><span aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-muted">₹</span>{input}</div> : input;
}
