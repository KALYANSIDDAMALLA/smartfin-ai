"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Select } from "./select";
import { NumInput } from "./num-input";
import { cn } from "./ui";
import { groupedCategoryOptions } from "@/lib/category-options";
import { DateBox } from "./date-box";

const PRESETS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["year", "This year"], ["custom", "Custom"]] as const;
const SORTS: Record<string, string> = { newest: "Newest first", oldest: "Oldest first", high: "Highest amount", low: "Lowest amount" };

/**
 * Sticky filter bar for the transactions list. Everything applies as you change it (search is debounced) and lives in the URL,
 * so filtered views can be bookmarked or shared. It stays pinned under the header while the list scrolls.
 */
export function TxFilters({ categories, methods, count }: { categories: { id: string; name: string; kind: string }[]; methods: { id: string; label: string }[]; count: number }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams(); const [pending, start] = useTransition();
  const get = (k: string) => sp.get(k) ?? ""; const range = get("range") || "year";
  const [q, setQ] = useState(get("q")); const [min, setMin] = useState(get("min")); const [max, setMax] = useState(get("max")); const [open, setOpen] = useState(false);
  
  /** Query string that already includes changes still loading, so quick successive changes add up instead of overwriting each other. */
  const latest = useRef<string | null>(null); const queued = useRef<Record<string, string | null>>({}); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { if (!pending) latest.current = null; }, [sp, pending]);

  /** Merge changes into the current URL (clearing paging) without jumping the scroll position. */
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(latest.current ?? sp.toString()); for (const [k, v] of Object.entries({ ...queued.current, ...patch })) { if (v) p.set(k, v); else p.delete(k); } p.delete("page");
    queued.current = {}; clearTimeout(timer.current); latest.current = p.toString();
    start(() => router.replace(`${path}?${p}`, { scroll: false }));
  };
  /** Debounced change (typing). Waiting typed values are kept and sent together with whatever is applied next, so none is dropped. */
  const later = (patch: Record<string, string | null>, ms = 350) => { queued.current = { ...queued.current, ...patch }; clearTimeout(timer.current); timer.current = setTimeout(() => go({}), ms); };
  const raw = (v: string) => v.replace(/,/g, "");

  type Chip = { label: string; patch: Record<string, string | null>; reset?: "q" | "min" | "max" };
  const chips: Chip[] = [];
  if (get("q")) chips.push({ label: `“${get("q")}”`, patch: { q: null }, reset: "q" });
  if (get("type")) chips.push({ label: get("type"), patch: { type: null } });
  if (get("cat")) chips.push({ label: categories.find((c) => c.id === get("cat"))?.name ?? "Category", patch: { cat: null } });
  if (get("method")) chips.push({ label: methods.find((m) => m.id === get("method"))?.label ?? "Method", patch: { method: null } });
  if (get("channel")) chips.push({ label: get("channel"), patch: { channel: null } });
  if (get("min")) chips.push({ label: `≥ ₹${get("min")}`, patch: { min: null }, reset: "min" });
  if (get("max")) chips.push({ label: `≤ ₹${get("max")}`, patch: { max: null }, reset: "max" });
  if (range === "custom" && get("from") && get("to")) chips.push({ label: `${get("from")} → ${get("to")}`, patch: { range: "year", from: null, to: null } });
  const clearChip = (c: Chip) => { if (c.reset === "q") setQ(""); if (c.reset === "min") setMin(""); if (c.reset === "max") setMax(""); go(c.patch); };
  const clearAll = () => { setQ(""); setMin(""); setMax(""); go({ q: null, type: null, cat: null, method: null, channel: null, min: null, max: null, ...(range === "custom" ? { range: "year", from: null, to: null } : {}) }); };

  return (
    <div className="glass sticky top-[4.75rem] z-20 mb-4 grid gap-3 rounded-2xl p-3" role="search" aria-label="Filter transactions">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); later({ q: e.target.value.trim() || null }); }} aria-label="Search transactions" placeholder="Search name, merchant or description…" autoComplete="off"
            className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface/70 pl-9 pr-9 text-sm" />
          {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); go({ q: null }); }} className="absolute right-0 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded text-muted hover:text-fg"><X size={14} /></button>}
        </div>
        <div role="group" aria-label="Date range" className="order-last flex w-full flex-wrap gap-1 rounded-lg border border-line bg-surface/70 p-1 md:order-none md:w-auto">
          {PRESETS.map(([k, label]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => go(k === "custom" ? { range: "custom" } : { range: k, from: null, to: null })}
            className={cn("grow whitespace-nowrap rounded-md px-2.5 py-2 text-center text-sm transition md:grow-0 md:py-1", range === k ? "bg-brand text-brandfg shadow-sm" : "hover:bg-surface2")}>{label}</button>)}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm transition hover:border-brand/50 md:hidden"><SlidersHorizontal size={15} aria-hidden />Filters{chips.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold text-brandfg">{chips.length}</span>}</button>
      </div>

      {range === "custom" && <div role="group" aria-label="Custom date range" className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <DateBox label="From date" value={get("from")} max={get("to") || undefined} onValueChange={(v) => go({ range: "custom", from: v || null })} className="flex-1 sm:max-w-48" />
          <span className="text-sm text-muted">to</span>
          <DateBox label="To date" value={get("to")} min={get("from") || undefined} onValueChange={(v) => go({ range: "custom", to: v || null })} className="flex-1 sm:max-w-48" /></div>
        {!(get("from") && get("to")) && <p className="text-xs text-muted">Pick a start and an end date to see that period.</p>}</div>}

      <div className={cn("grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6", !open && "max-md:hidden")}>
        <Select aria-label="Type" value={get("type")} onChange={(e) => go({ type: e.target.value || null })}><option value="">All types</option>{["expense", "income", "refund", "transfer", "adjustment"].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        <Select kind="category" aria-label="Category" value={get("cat")} onChange={(e) => go({ cat: e.target.value || null })}><option value="">All categories</option>{groupedCategoryOptions(categories)}</Select>
        <Select kind="method" aria-label="Payment method" value={get("method")} onChange={(e) => go({ method: e.target.value || null })}><option value="">All payment methods</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
        <Select aria-label="Online or offline" value={get("channel")} onChange={(e) => go({ channel: e.target.value || null })}><option value="">Online & offline</option><option value="online">Online</option><option value="offline">Offline</option></Select>
        <Select aria-label="Sort" value={get("sort") || "newest"} onChange={(e) => go({ sort: e.target.value === "newest" ? null : e.target.value })}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <div className="flex items-center gap-1.5"><NumInput value={min} onValueChange={(v) => { setMin(v); later({ min: raw(v) || null }, 500); }} aria-label="Minimum amount" placeholder="Min" className="h-10 text-sm" /><span className="text-muted" aria-hidden>–</span><NumInput value={max} onValueChange={(v) => { setMax(v); later({ max: raw(v) || null }, 500); }} aria-label="Maximum amount" placeholder="Max" className="h-10 text-sm" /></div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="text-muted">{pending ? <span className="inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden />Updating…</span> : <><b className="text-fg">{count.toLocaleString("en-IN")}</b> transaction{count === 1 ? "" : "s"}</>}</span>
        {chips.map((c) => <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand">{c.label}<button type="button" aria-label={`Remove filter ${c.label}`} onClick={() => clearChip(c)} className="rounded-full p-0.5 hover:bg-brand/20"><X size={12} /></button></span>)}
        {chips.length > 1 && <button type="button" onClick={clearAll} className="text-xs font-medium text-brand underline-offset-2 hover:underline">Clear all</button>}
      </div>
    </div>
  );
}
