import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarDays, FileClock, Hand, Landmark, PiggyBank, Repeat, Sparkles, Sun, Moon, Target, TriangleAlert, Upload, Wallet, Undo2, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { markNotificationsRead } from "@/app/actions/plan";
import { ActionForm } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SummaryLine } from "@/components/summary-line";
import { cn } from "@/components/ui";

/** Each notification kind belongs to a module: icon, colour, and where "Open" takes you. */
const KINDS: Record<string, { label: string; icon: LucideIcon; tone: string; href: string }> = {
  budget: { label: "Budgets", icon: Wallet, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300", href: "/budgets" },
  goal: { label: "Goals", icon: Target, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", href: "/goals" },
  income: { label: "Income", icon: Banknote, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", href: "/income" },
  refund: { label: "Refunds", icon: Undo2, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300", href: "/transactions" },
  unusual: { label: "Spending alerts", icon: TriangleAlert, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300", href: "/transactions" },
  loan: { label: "Loans", icon: Landmark, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300", href: "/repayments" },
  daily: { label: "Daily budget", icon: Sun, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300", href: "/dashboard" },
  daily_night: { label: "Daily verdict", icon: Moon, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300", href: "/dashboard" },
  recurring: { label: "Bills & reminders", icon: Repeat, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300", href: "/repayments" },
  draft: { label: "Drafts", icon: FileClock, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-300", href: "/calendar" },
  calendar: { label: "Calendar", icon: CalendarDays, tone: "bg-orange-500/15 text-orange-600 dark:text-orange-300", href: "/calendar" },
  savings: { label: "Savings", icon: PiggyBank, tone: "bg-teal-500/15 text-teal-600 dark:text-teal-300", href: "/savings" },
  import: { label: "Imports", icon: Upload, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300", href: "/imports" },
  welcome: { label: "Tips", icon: Hand, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300", href: "/expenses/new" },
};
const FALLBACK = { label: "Updates", icon: Sparkles, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300", href: "/dashboard" };
const ago = (iso: string) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 604800) return `${Math.floor(s / 86400)} d ago`; return null; };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const { supabase, profile } = await requireUser();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  const all = data ?? []; const unread = all.filter((n) => !n.read_at).length;
  const counts = all.reduce<Record<string, number>>((m, n) => ((m[n.kind] = (m[n.kind] ?? 0) + 1), m), {});
  const list = kind && counts[kind] ? all.filter((n) => n.kind === kind) : all;
  const chip = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition sm:py-1", active ? "border-brand bg-brand text-brandfg" : "border-line bg-surface/70 hover:border-brand/50");
  return (
    <>
      <PageHeader title="Notifications" desc={<SummaryLine pill={unread ? <><span className="tabnum">{unread}</span> unread</> : "All caught up"} items={[`${all.length} in total`, !!kind && !!counts[kind] && `showing ${(KINDS[kind] ?? FALLBACK).label}`, { t: "budgets, bills, goals, drafts and festivals", small: true }]} />} action={unread > 0 ? <ActionForm action={markNotificationsRead} submit="Mark all read" variant="outline" /> : undefined} />
      {!all.length ? <EmptyState title="You're all caught up" hint="Budget alerts, bill reminders, goal milestones, festivals and import results appear here." /> : <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by module">
          <Link href="/notifications" className={chip(!kind || !counts[kind])}>All <span className="text-xs opacity-80">{all.length}</span></Link>
          {Object.entries(counts).map(([k, n]) => <Link key={k} href={`/notifications?kind=${k}`} className={chip(kind === k)}>{(KINDS[k] ?? FALLBACK).label} <span className="text-xs opacity-80">{n}</span></Link>)}
        </div>
        <div className="grid gap-2">{list.map((n) => { const k = KINDS[n.kind] ?? FALLBACK; const Icon = k.icon; const t = ago(n.created_at);
          return (
            <Card key={n.id} className={cn("relative", n.read_at ? "opacity-70" : "border-brand/40")}><div className="flex items-start gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", k.tone)}><Icon size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">{!n.read_at && <span className="h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}{n.title}<span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-muted">{k.label}</span></p>
                {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{t ?? new Date(n.created_at).toLocaleString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                <Link href={k.href} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand hover:bg-brand/10">Open<ArrowUpRight size={14} aria-hidden /></Link>
                {!n.read_at && <ActionForm action={markNotificationsRead} compact submit="Mark read" variant="ghost"><input type="hidden" name="id" value={n.id} /></ActionForm>}
              </div>
            </div></Card>); })}</div>
      </>}
    </>
  );
}
