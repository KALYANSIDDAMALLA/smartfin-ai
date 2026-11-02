"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, CornerDownLeft, type LucideIcon } from "lucide-react";
import { NAV_ITEMS, hintsFor } from "@/lib/nav";
import { parseSearchQuery, searchHref, type SearchCtx } from "@/lib/finance/search";
import { cn } from "./ui";

type Item = { id: string; kind: "page" | "search"; label: string; sub?: string; href: string; icon?: LucideIcon; section: string };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Page score for a typed query: 3 = label starts with it, 2 = label contains it, 1 = group/keyword match; 0 = no match. */
function score(q: string, i: { label: string; group: string; kw?: string }) {
  const l = norm(i.label); const words = q.split(" ").filter(Boolean); if (!words.length) return 0;
  if (l.startsWith(q)) return 3; if (l.includes(q)) return 2;
  const hay = `${l} ${norm(i.group)} ${norm(i.kw ?? "")}`; return words.every((w) => hay.includes(w)) ? 1 : 0;
}

/** Header search: click it for ideas for this page, type to jump to a page/sub-module or run a plain-English transaction search. Ctrl/⌘+K focuses it. */
export function GlobalSearch({ ctx, className }: { ctx?: Pick<SearchCtx, "categories" | "methods">; className?: string }) {
  const router = useRouter(); const path = usePathname(); const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [activeRaw, setActive] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); input.current?.select(); setOpen(true); } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, []);

  const query = norm(q); const searchTo = (text: string) => (ctx ? searchHref(parseSearchQuery(text, { ...ctx })) : `/transactions?q=${encodeURIComponent(text)}`);
  const items: Item[] = [];
  if (query) {
    const pages = NAV_ITEMS.map((i) => ({ i, s: score(query, i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
    const pageItems: Item[] = pages.map(({ i }) => ({ id: `p-${i.href}`, kind: "page", label: i.label, sub: i.group, href: i.href, icon: i.icon, section: "Go to" }));
    const chips = ctx && query.length >= 2 ? parseSearchQuery(q, { ...ctx }).chips : [];
    const searchItem: Item | null = query.length >= 2 ? { id: "s-q", kind: "search", label: `Search transactions: “${q.trim()}”`, sub: chips.length ? `Understood: ${chips.join(" · ")}` : undefined, href: searchTo(q), icon: Search, section: "Search" } : null;
    // A short word that matches a page name ("weekly", "goals") puts the page first; anything else searches transactions first.
    if (pages[0]?.s === 3 && !/\d/.test(query) && query.split(" ").length <= 2) items.push(...pageItems, ...(searchItem ? [searchItem] : [])); else items.push(...(searchItem ? [searchItem] : []), ...pageItems);
  } else {
    const h = hintsFor(path);
    h.searches.forEach((s) => items.push({ id: `h-${s}`, kind: "search", label: s, href: searchTo(s), icon: Search, section: "Try searching" }));
    h.related.forEach((href) => { const i = NAV_ITEMS.find((n) => n.href === href); if (i) items.push({ id: `r-${href}`, kind: "page", label: i.label, sub: i.group, href, icon: i.icon, section: "Jump to" }); });
  }
  const active = Math.min(activeRaw, Math.max(items.length - 1, 0));
  const go = (it: Item | undefined) => { if (!it) return; setOpen(false); setQ(""); input.current?.blur(); router.push(it.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((active + 1) % Math.max(items.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + items.length) % Math.max(items.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
    else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  };
  let lastSection = "";
  return (
    <div role="search" className={cn("relative", className)}>
      <Search size={16} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" aria-hidden />
      <input ref={input} name="q" role="combobox" aria-expanded={open} aria-controls="global-search-list" aria-autocomplete="list" aria-activedescendant={open && items[active] ? `gs-${items[active].id}` : undefined}
        aria-label="Search pages or transactions" autoComplete="off" value={q} placeholder="Search pages or transactions…  Ctrl K"
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        className="h-9 w-full rounded-lg border border-line bg-bg/60 pl-9 pr-3 text-sm outline-none transition focus:bg-bg" />
      {open && items.length > 0 && (
        <ul id="global-search-list" role="listbox" aria-label="Suggestions" className="absolute right-0 top-full z-50 mt-2 max-h-[min(26rem,70vh)] w-[max(100%,22rem)] max-w-[92vw] overflow-y-auto pop rounded-2xl p-1.5">
          {items.map((it, idx) => {
            const head = it.section !== lastSection ? it.section : null; lastSection = it.section; const Icon = it.icon;
            return (
              <li key={it.id} role="presentation">
                {head && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{head}</p>}
                <div id={`gs-${it.id}`} role="option" aria-selected={idx === active} onMouseDown={(e) => { e.preventDefault(); go(it); }} onMouseEnter={() => setActive(idx)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm", idx === active ? "bg-brand/12 text-brand" : "hover:bg-surface2/60")}>
                  {Icon && <Icon size={16} className="shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1"><span className="block truncate">{it.label}</span>{it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}</span>
                  {idx === active && <CornerDownLeft size={14} className="shrink-0 text-muted" aria-hidden />}
                </div>
              </li>
            );
          })}
          <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] text-muted">↑ ↓ to move · Enter to open · Esc to close</li>
        </ul>
      )}
    </div>
  );
}
