import Link from "next/link";
import { cn } from "./ui";
import { PRESETS, type SP } from "@/lib/server/range";

/** Server-rendered range tabs; keeps other query params (search, filters). */
export function RangeFilter({ base, sp, active }: { base: string; sp: SP; active: string }) {
  const href = (range: string) => {
    const p = new URLSearchParams(); Object.entries(sp).forEach(([k, v]) => v && !["range", "page"].includes(k) && p.set(k, v)); p.set("range", range);
    return `${base}?${p}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Date range" className="flex w-full gap-1 rounded-lg border border-line bg-surface p-1 sm:w-auto">
        {PRESETS.filter((p) => p.key !== "custom").map((p) => (
          <Link key={p.key} href={href(p.key)} aria-current={active === p.key ? "true" : undefined}
            className={cn("flex-1 whitespace-nowrap rounded-md px-1.5 py-2.5 text-center text-sm hover:bg-surface2 sm:flex-none sm:px-3 sm:py-1", active === p.key && "bg-brand text-brandfg hover:bg-brand")}>{p.label}</Link>
        ))}
      </nav>
      <form className="grid w-full grid-cols-2 gap-2 text-sm sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-1" action={base}>
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" aria-label="From" defaultValue={sp.from} required className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2 sm:h-9 sm:w-auto" />
        <span className="hidden text-muted sm:inline">to</span>
        <input type="date" name="to" aria-label="To" defaultValue={sp.to} required className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2 sm:h-9 sm:w-auto" />
        <button className="col-span-2 h-11 rounded-lg border border-line bg-surface px-3 hover:bg-surface2 sm:col-span-1 sm:h-9">Apply custom range</button>
      </form>
    </div>
  );
}
