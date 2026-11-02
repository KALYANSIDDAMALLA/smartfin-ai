"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "./select";

/** "Rows per page" choice: changes the page count and returns to page 1. Lives in the URL like the other filters. */
export function PageSize({ value, sizes }: { value: number; sizes: number[] }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-muted"><span className="whitespace-nowrap">Rows per page</span>
      <Select aria-label="Rows per page" value={String(value)} className="w-24" onChange={(e) => { const p = new URLSearchParams(sp.toString()); p.delete("page"); if (e.target.value === "25") p.delete("size"); else p.set("size", e.target.value); router.replace(`${path}?${p}`, { scroll: false }); }}>
        {sizes.map((n) => <option key={n} value={String(n)}>{n}</option>)}</Select></label>
  );
}
