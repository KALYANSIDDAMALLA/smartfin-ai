import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { PageSize } from "./page-size";
import { cn } from "./ui";

/** 1 … 4 [5] 6 … 18 : always the first, last and current page with its neighbours. */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages)); const out: (number | "…")[] = []; let prev = 0;
  for (const n of [...set].sort((a, b) => a - b)) { if (n - prev > 1) out.push("…"); out.push(n); prev = n; }
  return out;
}

/** Summary ("Showing 101–125 of 450"), numbered pages with First/Previous/Next/Last, and the rows-per-page choice. */
export function Pagination({ page, pages, size, count, sizes, hrefFor }: { page: number; pages: number; size: number; count: number; sizes: number[]; hrefFor: (n: number) => string }) {
  if (count === 0) return null;
  const from = (page - 1) * size + 1; const to = Math.min(page * size, count);
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition";
  const off = "pointer-events-none border-line/50 text-muted/50";
  return (
    <nav aria-label="Pagination" className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <p className="text-sm text-muted">Showing <b className="text-fg">{from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}</b> of <b className="text-fg">{count.toLocaleString("en-IN")}</b></p>
      {pages > 1 ? (
        <ul className="flex flex-wrap items-center justify-center gap-1">
          <li><Link href={hrefFor(1)} aria-label="First page" aria-disabled={page === 1} tabIndex={page === 1 ? -1 : undefined} className={cn(btn, "border-line hover:border-brand/50", page === 1 && off)}><ChevronsLeft size={16} aria-hidden /></Link></li>
          <li><Link href={hrefFor(page - 1)} aria-label="Previous page" aria-disabled={page === 1} tabIndex={page === 1 ? -1 : undefined} className={cn(btn, "border-line hover:border-brand/50", page === 1 && off)}><ChevronLeft size={16} aria-hidden /></Link></li>
          {pageWindow(page, pages).map((n, i) => n === "…" ? <li key={`g${i}`} aria-hidden className="px-1 text-muted">…</li>
            : <li key={n}><Link href={hrefFor(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} className={cn(btn, n === page ? "border-brand bg-brand text-brandfg shadow-sm" : "border-line hover:border-brand/50")}>{n}</Link></li>)}
          <li><Link href={hrefFor(page + 1)} aria-label="Next page" aria-disabled={page === pages} tabIndex={page === pages ? -1 : undefined} className={cn(btn, "border-line hover:border-brand/50", page === pages && off)}><ChevronRight size={16} aria-hidden /></Link></li>
          <li><Link href={hrefFor(pages)} aria-label="Last page" aria-disabled={page === pages} tabIndex={page === pages ? -1 : undefined} className={cn(btn, "border-line hover:border-brand/50", page === pages && off)}><ChevronsRight size={16} aria-hidden /></Link></li>
        </ul>
      ) : <span />}
      <div className="md:justify-self-end"><PageSize value={size} sizes={sizes} /></div>
    </nav>
  );
}
