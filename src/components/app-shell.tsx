"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Bell, Menu, Sun, Moon, LogOut, X, ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "./ui";
import { askConfirm } from "@/lib/feedback-bus";
import { Logo, LogoMark } from "./logo";
import { CalculatorButton } from "./calculator";
import { usePref } from "@/lib/use-pref";
import { AskAiFab } from "./ask-ai-fab";
import { NAV, SETTINGS_ITEM, DASHBOARD_ITEM, ANALYTICS_ITEM, INTEGRATIONS_ITEM, CALENDAR_ITEM } from "@/lib/nav";
import { GlobalSearch } from "./global-search";
import { LiveClock } from "./live-clock";
import type { SearchCtx } from "@/lib/finance/search";

export function AppShell({ children, name, unread, avatarUrl, searchCtx, timezone, email }: { children: React.ReactNode; name: string; unread: number; avatarUrl?: string | null; searchCtx?: Pick<SearchCtx, "categories" | "methods">; timezone?: string; email?: string }) {
  const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [menu, setMenu] = useState(false); const menuBox = useRef<HTMLDivElement>(null);
  // The account menu closes when you click anywhere else or press Esc (choosing an item closes it too).
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (menuBox.current && !menuBox.current.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);
  // The phone menu drawer: the page behind it stops scrolling while it is open, and Esc closes it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [open]);
  const { resolvedTheme, setTheme } = useTheme();
  // Sidebar preferences (per browser): which module groups are open, and whether the desktop sidebar is collapsed to icons.
  const [openRaw, setOpenRaw] = usePref("sf.nav.open", JSON.stringify(["Money"]));
  const [collapsedRaw, setCollapsedRaw] = usePref("sf.nav.collapsed", "0");
  const collapsed = collapsedRaw === "1";
  const openGroups: string[] = (() => { try { const v = JSON.parse(openRaw); return Array.isArray(v) ? v : []; } catch { return []; } })();
  const isActive = (href: string) => path === href || (href !== "/dashboard" && path.startsWith(href + "/"));
  const toggleGroup = (g: string) => setOpenRaw(JSON.stringify(openGroups.includes(g) ? openGroups.filter((x) => x !== g) : [...openGroups, g]));
  const renderNav = (compact: boolean) => (
    <nav aria-label="Main" className={cn("grid px-3 pb-0 pt-2.5", compact ? "gap-1" : "gap-1.5")}>
      {NAV.map((g, gi) => {
        const hasActive = g.items.some((i) => isActive(i.href));
        const expanded = openGroups.includes(g.group); // any group can be closed, including the one you're in (its header stays highlighted so you still see where you are)
        return (
          <div key={g.group} className={cn(compact && gi > 0 && "mt-1 border-t border-line/60 pt-2")}>
            {!compact && (
              <button type="button" onClick={() => toggleGroup(g.group)} aria-expanded={expanded} aria-controls={`nav-${g.group}`}
                className={cn("mb-1 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm transition",
                  hasActive ? "border-brand/30 bg-brand/10 text-brand" : "border-line/70 bg-surface2/50 text-fg hover:border-brand/40 hover:bg-brand/10 hover:text-brand")}>
                <g.icon size={15} aria-hidden /><span className="flex-1 text-left">{g.group}</span><ChevronDown size={14} aria-hidden className={cn("transition-transform", !expanded && "-rotate-90")} />
              </button>
            )}
            <div id={`nav-${g.group}`} hidden={!compact && !expanded} className={cn("grid gap-0.5", !compact && "pb-1.5")}>
              {g.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => { setOpen(false); if (!compact && !openGroups.includes(g.group)) toggleGroup(g.group); }} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)} aria-current={isActive(href) ? "page" : undefined} aria-label={compact ? label : undefined} title={compact ? label : undefined}
                  className={cn("flex items-center rounded-lg text-sm transition hover:bg-surface2/70", compact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2", isActive(href) && "bg-brand/12 font-medium text-brand shadow-sm ring-1 ring-brand/20")}>
                  <span className="relative grid place-items-center"><Icon size={compact ? 18 : 16} aria-hidden /></span>
                  {!compact && <span className="flex-1">{label}</span>}
                  
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
  /** A standalone sidebar item (outside the module groups) styled like a group header button. */
  const pinnedLink = (item: typeof SETTINGS_ITEM, compact: boolean) => {
    const on = isActive(item.href); const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} onMouseEnter={() => router.prefetch(item.href)} aria-current={on ? "page" : undefined} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined}
        className={cn("flex min-h-[38px] items-center rounded-xl border text-xs font-semibold uppercase tracking-wide shadow-sm transition", compact ? "justify-center py-2" : "gap-2.5 px-3 py-2",
          on ? "border-brand/30 bg-brand/10 text-brand" : "border-line/70 bg-surface2/50 text-fg hover:border-brand/40 hover:bg-brand/10 hover:text-brand")}>
        <span className="relative grid place-items-center"><Icon size={compact ? 18 : 15} aria-hidden /></span>{!compact && <span className="flex-1">{item.label}</span>}
        
      </Link>
    );
  };
  // Same 10px rhythm as between the module groups: Dashboard on top; Analytics, Bank account links, Calendar and Settings stacked after the last module.
  const renderTop = (compact: boolean) => <div className="px-3 pt-3">{pinnedLink(DASHBOARD_ITEM, compact)}</div>;
  const renderTail = (compact: boolean) => <div className="grid gap-2.5 px-3 pb-3 pt-1.5">{pinnedLink(ANALYTICS_ITEM, compact)}{pinnedLink(INTEGRATIONS_ITEM, compact)}{pinnedLink(CALENDAR_ITEM, compact)}{pinnedLink(SETTINGS_ITEM, compact)}</div>;
  // Log out, pinned to the bottom of the sidebar (and the phone drawer) in red. Same "are you sure?" step as the account menu.
  const confirmLogout = () => {
    void askConfirm({ title: "Log out?", message: "Are you sure you want to log out?", confirmLabel: "Yes, log out", cancelLabel: "Stay logged in", tone: "danger" }).then((ok) => {
      if (!ok) return; const f = document.createElement("form"); f.method = "post"; f.action = "/auth/signout"; document.body.appendChild(f); f.submit();
    });
  };
  const renderLogout = (compact: boolean) => (
    <div className="shrink-0 border-t border-line/50 px-3 pb-3 pt-2.5">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); confirmLogout(); }} aria-label="Log out" title={compact ? "Log out" : undefined}
        className={cn("flex min-h-[38px] w-full items-center rounded-xl border border-bad/50 bg-bad/10 text-xs font-semibold uppercase tracking-wide text-bad shadow-sm transition hover:bg-bad hover:text-white focus-visible:outline-2 focus-visible:outline-bad", compact ? "justify-center py-2" : "gap-2.5 px-3 py-2")}>
        <LogOut size={compact ? 18 : 15} aria-hidden />{!compact && <span className="flex-1 text-left">Log out</span>}</button>
    </div>
  );
  return (
    <div className="flex min-h-screen">
      <aside aria-label="Sidebar" title={collapsed ? "Click to expand" : undefined} onClick={() => { if (collapsed) setCollapsedRaw("0"); }} className={cn(collapsed && "cursor-pointer", "glass sticky top-3 m-3 hidden h-[calc(100vh-1.5rem)] shrink-0 overflow-hidden rounded-2xl transition-[width] duration-200 lg:flex lg:flex-col", collapsed ? "w-[4.5rem]" : "w-60")}>
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2 px-2 py-4" : "justify-between px-5 py-5")}>
          <Link href="/dashboard" aria-label="SmartFin AI home" className="text-brand">{collapsed ? <LogoMark size={30} /> : <Logo />}</Link>
          <button type="button" onClick={() => setCollapsedRaw(collapsed ? "0" : "1")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-surface2/70 hover:text-brand">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        </div>
        {/* Only this middle part scrolls; Log out below it is a fixed footer, so the menu can never slide under it. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {renderTop(collapsed)}
          {renderNav(collapsed)}
          {renderTail(collapsed)}
        </div>
        {renderLogout(collapsed)}
      </aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Menu">
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div className="pop absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-hidden rounded-r-2xl"><div className="flex shrink-0 items-center justify-between px-6 py-4"><Link href="/dashboard" onClick={() => setOpen(false)} className="text-brand"><Logo /></Link><button aria-label="Close menu" onClick={() => setOpen(false)} className="-mr-3 grid h-11 w-11 place-items-center rounded-lg hover:bg-surface2/60"><X size={18} /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{renderTop(false)}{renderNav(false)}{renderTail(false)}</div>{renderLogout(false)}</div>
      </div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-3 z-30 mx-3 mt-3 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-3 sm:gap-3 sm:px-4 lg:mr-4 2xl:grid-cols-[1fr_minmax(0,26rem)_1fr]">
          <div className="flex items-center gap-3"><button className="-ml-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-surface2/60 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
            <div className="hidden md:block"><LiveClock timezone={timezone} /></div></div>
          <GlobalSearch ctx={searchCtx} className="mx-auto w-full min-w-0 max-w-lg 2xl:max-w-none" />
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <div className="hidden sm:block"><CalculatorButton /></div>
            <button type="button" aria-label="Toggle theme" data-tip="Switch theme" className="icon-btn" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Sun size={18} className="hidden dark:block" /><Moon size={18} className="dark:hidden" /></button>
            <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} data-tip={unread ? `${unread} unread` : "Notifications"} className="icon-btn"><Bell size={18} />
              {unread > 0 && <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center"><span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-bad/60" aria-hidden /><span className="relative grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white">{unread > 999 ? "999+" : unread}</span></span>}</Link>
            <div className="relative" ref={menuBox}>
              <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={`Account menu, ${name}`} onClick={() => setMenu(!menu)}
                className={cn("flex items-center gap-2 rounded-full border border-line/70 bg-surface2/50 p-0.5 pr-0.5 transition hover:border-brand/50 xl:pr-3", menu && "border-brand/60 bg-brand/10")}>
                <span className="avatar-ring block">{avatarUrl // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-sm font-semibold text-brand">{name.slice(0, 1).toUpperCase()}</span>}</span>
                <span className="hidden max-w-[10rem] truncate text-sm font-semibold xl:block">{name}</span>
                <ChevronDown size={15} aria-hidden className={cn("hidden text-muted transition-transform xl:block", menu && "rotate-180 text-brand")} />
              </button>
              {menu && <div role="menu" onClick={(e) => { if (!(e.target as HTMLElement).closest("form")) setMenu(false); }} className="pop absolute right-0 z-50 mt-2 w-64 rounded-xl p-1"> {/* links close the menu; the log-out form must stay mounted until the browser has submitted it */}
                <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-brand/10 px-3 py-2.5 ring-1 ring-brand/20">
                  {avatarUrl // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brandfg">{name.slice(0, 1).toUpperCase()}</span>}
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-brand">{name}</span>{email && <span className="block truncate text-xs text-muted">{email}</span>}</span>
                </div>
                <Link role="menuitem" href="/settings" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-sm transition hover:bg-brand/10 hover:text-brand">Profile & settings</Link>
                <Link role="menuitem" href="/settings#change-password" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-sm transition hover:bg-brand/10 hover:text-brand">Change password</Link>
                <form action="/auth/signout" method="post" onSubmit={(e) => { e.preventDefault(); // ask first. Clicking the pop-up closes this menu (and removes this form), so a fresh form is submitted on "yes"
                  void askConfirm({ title: "Log out?", message: "Are you sure you want to log out?", confirmLabel: "Yes, log out", cancelLabel: "Stay logged in", tone: "danger" }).then((ok) => {
                    if (!ok) return; const f = document.createElement("form"); f.method = "post"; f.action = "/auth/signout"; document.body.appendChild(f); f.submit(); }); }}><button role="menuitem" className="mt-1 flex min-h-[38px] w-full items-center gap-2.5 rounded-xl border border-bad/50 bg-bad/10 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-bad shadow-sm transition hover:bg-bad hover:text-white"><LogOut size={15} aria-hidden /> Log out</button></form>
              </div>}
            </div>
          </div>
        </header>
        <AskAiFab />
        <main className="page-in mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
