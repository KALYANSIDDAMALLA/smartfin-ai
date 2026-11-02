"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { cn } from "./ui";

export interface Opt { value: string; label: string; sub?: string; icon?: LucideIcon; hue?: number; group?: string }
const chip = (hue?: number) => (hue == null ? undefined : { background: `hsl(${hue} 80% 55% / .16)`, color: `hsl(${hue} 70% 52%)` });

/**
 * Accessible custom dropdown (replaces the native <select>): colour-coded icons, optional search, groups, full keyboard control
 * (↑ ↓ Home End Enter Esc, type to jump). The value is also written to a hidden input so ordinary <form> submission still works.
 * The list is rendered in a portal so no card or container can clip or cover it.
 */
export function Dropdown({ name, value, onChange, options, placeholder = "Select…", searchable, ariaLabel, auto, invalid }: {
  name?: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; searchable?: boolean; ariaLabel?: string; auto?: boolean; invalid?: boolean;
}) {
  const id = useId(); const btn = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [activeRaw, setActive] = useState(0); const [pos, setPos] = useState({ left: 0, width: 0, top: 0, bottom: 0, up: false });
  const showSearch = searchable ?? options.length > 8;
  const shown = q.trim() ? options.filter((o) => `${o.label} ${o.sub ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const active = Math.min(activeRaw, Math.max(shown.length - 1, 0)); const selected = options.find((o) => o.value === value);

  const show = () => {
    const r = btn.current!.getBoundingClientRect(); const below = window.innerHeight - r.bottom; const up = below < 300 && r.top > below;
    setPos({ left: r.left, width: r.width, top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, up });
    setQ(""); setActive(Math.max(options.findIndex((o) => o.value === value), 0)); setOpen(true);
  };
  const close = (refocus = false) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (o: Opt | undefined) => { if (!o) return; onChange(o.value); close(true); };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); }; // scrolling the page closes it; scrolling the list does not
    document.addEventListener("mousedown", down); window.addEventListener("scroll", away, true); window.addEventListener("resize", away);
    (showSearch ? search.current : panel.current)?.focus({ preventScroll: true }); // focusing must not scroll the page, which would close the list
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open, showSearch]);
  useEffect(() => { // keep the highlighted option visible by scrolling the list only (scrollIntoView could scroll the whole page and close the list)
    if (!open) return; const p = panel.current; const el = p?.querySelector<HTMLElement>(`[data-i="${active}"]`); if (!p || !el) return;
    const head = showSearch ? 56 : 0; const t = el.offsetTop, bt = t + el.offsetHeight;
    if (t - head < p.scrollTop) p.scrollTop = Math.max(0, t - head); else if (bt > p.scrollTop + p.clientHeight) p.scrollTop = bt - p.clientHeight + 6;
  }, [open, active, showSearch]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % Math.max(shown.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + shown.length) % Math.max(shown.length, 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); } else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); } else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") setOpen(false);
    else if (!showSearch && e.key.length === 1) { const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setActive(i); }
  };
  const SelIcon = selected?.icon; return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button ref={btn} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={ariaLabel} aria-invalid={invalid || undefined}
        onClick={() => (open ? close() : show())} onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } }}
        className={cn("flex h-10 w-full min-w-0 max-w-full items-center gap-2.5 rounded-lg border border-line bg-surface/70 px-2.5 text-left text-sm backdrop-blur-sm transition", open && "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_22%,transparent)]", auto && !open && "border-brand/60 bg-brand/5", invalid && "border-bad bg-bad/5")}>
        {SelIcon && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={chip(selected?.hue)}><SelIcon size={14} aria-hidden /></span>}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted transition-transform", open && "rotate-180 text-brand")} />
      </button>
      {open && createPortal(
        <div ref={panel} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={ariaLabel} onKeyDown={onKey}
          style={{ position: "fixed", left: pos.left, width: Math.max(pos.width, 220), ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }), zIndex: 100 }}
          className="pop max-h-[min(20rem,60vh)] scroll-pt-14 overflow-y-auto rounded-xl p-1.5 outline-none">
          {showSearch && <div className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-1 border-b border-line/60 bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] p-2">
            <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} aria-label="Search options" placeholder="Search…" autoComplete="off" className="h-8 w-full rounded-lg border border-line bg-bg/60 pl-8 pr-2 text-sm" /></div></div>}
          {shown.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">No matches</p>}
          {shown.map((o, i) => {
            const head = o.group && o.group !== shown[i - 1]?.group ? o.group : null; const Icon = o.icon; const isSel = o.value === value;
            return (
              <div key={o.value || "__empty"} role="presentation">
                {head && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{head}</p>}
                <div role="option" data-i={i} aria-selected={isSel} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === active ? "bg-brand/12" : "", isSel && "font-medium text-brand")}>
                  {Icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={chip(o.hue)}><Icon size={15} aria-hidden /></span>}
                  <span className="min-w-0 flex-1"><span className="block truncate">{o.label}</span>{o.sub && <span className="block truncate text-xs font-normal text-muted">{o.sub}</span>}</span>
                  {isSel && <Check size={15} aria-hidden className="shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>, document.body)}
    </>
  );
}
