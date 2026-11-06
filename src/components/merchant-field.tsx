"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

export interface MerchantOpt { merchant: string; count: number; categoryId?: string; methodId?: string; category?: string }
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/**
 * Merchant / recipient input with suggestions from the people and shops you've paid before (most frequent first).
 * Free typing always works; picking a suggestion can also fill the category and payment method from your own history.
 */
export function MerchantField({ name, defaultValue, options, placeholder, className, onText, onPick, onBlurValue, invalid }: {
  name: string; defaultValue?: string; options: MerchantOpt[]; placeholder?: string; className?: string; onText?: (v: string) => void; onPick?: (o: MerchantOpt) => void; onBlurValue?: (v: string) => void; invalid?: boolean;
}) {
  const id = useId(); const input = useRef<HTMLInputElement>(null); const panel = useRef<HTMLUListElement>(null);
  const [value, setValue] = useState(defaultValue ?? ""); const [open, setOpen] = useState(false); const [active, setActive] = useState(-1); const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const q = value.trim().toLowerCase();
  const list = (q ? options.filter((o) => o.merchant.toLowerCase().includes(q)) : options).filter((o) => o.merchant.toLowerCase() !== q).slice(0, 8);
  const show = () => { const r = input.current!.getBoundingClientRect(); setPos({ left: r.left, top: r.bottom + 6, width: r.width }); setOpen(true); };
  const pick = (o: MerchantOpt) => { setValue(o.merchant); setOpen(false); setActive(-1); onPick?.(o); };
  useEffect(() => {
    if (!open) return; const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", away, true); window.addEventListener("resize", away); return () => { window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open]);
  const visible = open && list.length > 0;
  return (
    <>
      <input ref={input} name={name} value={value} maxLength={200} autoComplete="off" placeholder={placeholder} role="combobox" aria-expanded={visible} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        onChange={(e) => { setValue(e.target.value); setActive(-1); onText?.(e.target.value); show(); }} onFocus={show} onClick={show} onBlur={(e) => { setOpen(false); onBlurValue?.(e.target.value); }} aria-invalid={invalid || undefined}
        onKeyDown={(e) => {
          if (!visible) { if (e.key === "ArrowDown" && options.length) { e.preventDefault(); show(); } return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % list.length); } else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + list.length) % list.length); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(list[active]); } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }}
        className={className} />
      {visible && createPortal(
        <ul ref={panel} id={`${id}-list`} role="listbox" aria-label="Past merchants and recipients" style={{ position: "fixed", left: pos.left, top: pos.top, width: Math.max(pos.width, 240), zIndex: 100 }} className="pop max-h-72 overflow-y-auto rounded-xl p-1.5">
          <li role="presentation" className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{q ? "Matches from your history" : "Frequent"}</li>
          {list.map((o, i) => (
            <li key={o.merchant} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === active && "bg-brand/12")}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: `hsl(${hue(o.merchant)} 80% 55% / .16)`, color: `hsl(${hue(o.merchant)} 70% 50%)` }}>{o.merchant.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate">{o.merchant}</span><span className="block truncate text-xs text-muted">{o.count} payment{o.count === 1 ? "" : "s"}{o.category ? ` · ${o.category}` : ""}</span></span>
            </li>))}
        </ul>, document.body)}
    </>
  );
}
