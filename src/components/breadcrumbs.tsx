"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { ANALYTICS_ITEM, CALENDAR_ITEM, DASHBOARD_ITEM, INTEGRATIONS_ITEM, NAV, NOTIFICATIONS_ITEM, SETTINGS_ITEM, type NavItem } from "@/lib/nav";

type Crumb = { label: string; href?: string };
const STANDALONE: NavItem[] = [DASHBOARD_ITEM, ANALYTICS_ITEM, INTEGRATIONS_ITEM, CALENDAR_ITEM, NOTIFICATIONS_ITEM, SETTINGS_ITEM];
const VIEW: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/**
 * Route trail for the current page: Home › Module › Sub-page › page level (for example "Money › Add expense › Finish draft",
 * "Analytics › Weekly"). Shown at the top left of every page, above the title, as on standard websites. Everything except the page you are on is a link back up the route.
 */
export function Breadcrumbs() {
  const path = usePathname(); const sp = useSearchParams(); const on = (href: string) => path === href || path.startsWith(href + "/");
  const trail: Crumb[] = [{ label: "Home", href: "/dashboard" }];
  const group = NAV.find((g) => g.items.some((i) => on(i.href))); const item = group?.items.find((i) => on(i.href)) ?? STANDALONE.find((i) => on(i.href));
  if (!item) return null;
  if (group) trail.push({ label: group.group });
  if (item.href !== "/dashboard") trail.push({ label: item.label, href: item.href });
  // page level: the state of the page you are on
  if (item.href === "/analytics") trail.push({ label: VIEW[sp.get("view") ?? "monthly"] ?? "Monthly" });
  else if (sp.get("draft")) trail.push({ label: "Finish draft" });
  else if (path === "/expenses/new" || path === "/income") trail.push({ label: path === "/income" ? "Record income" : "New expense" });
  const last = trail.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="max-w-full">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {trail.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden className="opacity-60" />}
            {i === last ? <span aria-current="page" className="font-semibold text-fg">{c.label}</span>
              : c.href ? <Link href={c.href} className={`-my-2 inline-flex items-center gap-1 rounded px-1 py-2.5 transition hover:bg-brand/10 hover:text-brand ${i === 0 ? "-ml-1" : ""}`}>{i === 0 && <Home size={12} aria-hidden />}{c.label}</Link>
              : <span className="px-1">{c.label}</span>}
          </li>))}
      </ol>
    </nav>
  );
}
