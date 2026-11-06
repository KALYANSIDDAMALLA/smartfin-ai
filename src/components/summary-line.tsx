import type { ReactNode } from "react";

type Item = ReactNode | { t: ReactNode; small?: boolean };
const isSmall = (i: Item): i is { t: ReactNode; small?: boolean } => typeof i === "object" && i !== null && "t" in (i as object) && !("$$typeof" in (i as object));

/**
 * The line under a page title: a highlighted pill with the headline number or name, then short facts separated by dots
 * (period, totals, what is on screen). Every data page uses it, so the whole app reads the same way.
 */
export function SummaryLine({ pill, items = [] }: { pill: ReactNode; items?: (Item | false | null | undefined)[] }) {
  const shown = items.filter((i): i is Item => i !== false && i !== null && i !== undefined && i !== "");
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className="rounded-full bg-brand/12 px-2.5 py-0.5 font-semibold text-brand">{pill}</span>
      {shown.map((i, n) => (
        <span key={n} className="contents"><span aria-hidden className="opacity-40">•</span><span className={isSmall(i) && i.small ? "text-xs" : undefined}>{isSmall(i) ? i.t : i}</span></span>
      ))}
    </span>
  );
}
