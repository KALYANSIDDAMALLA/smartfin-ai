import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Breadcrumbs } from "./breadcrumbs";
export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(a));

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" };
export function Button({ className, variant = "primary", size = "md", ...p }: BtnProps) {
  const v = { primary: "btn-shine bg-linear-to-b from-brand to-brand/85 text-brandfg shadow-sm shadow-brand/25 hover:brightness-105", outline: "glass hover:bg-surface2/60", ghost: "hover:bg-surface2", danger: "bg-bad text-white hover:opacity-90" }[variant];
  return <button {...p} className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none", size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm", v, className)} />;
}
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div {...p} className={cn("glass rounded-2xl p-4 sm:p-5", className)} />;
export const inputCls = "h-10 w-full min-w-0 rounded-lg border border-line bg-surface/70 px-3 text-sm backdrop-blur-sm transition placeholder:text-muted focus:bg-surface";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} {...p} className={cn(inputCls, className)} />);
Input.displayName = "Input";
export { Select } from "./select";
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(inputCls, "h-auto py-2", className)} />;
export function Field({ label, children, hint, auto, error }: { label: string; children: React.ReactNode; hint?: string; auto?: boolean; error?: string }) {
  return <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5 text-sm"><span className="flex min-h-[22px] items-center gap-2 font-medium">{label}{auto && <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2zm7 11l.9 2.6L22.5 16l-2.6.9L19 19.5l-.9-2.6-2.6-.9 2.6-.9.9-2.6z" /></svg>auto-filled</span>}</span>{children}{error ? <span role="alert" className="text-xs font-medium text-bad">{error}</span> : hint && <span className="text-xs text-muted">{hint}</span>}</label>;
}
export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  const t = { neutral: "bg-surface2 text-muted", good: "bg-good/15 text-good", warn: "bg-warn/15 text-warn", bad: "bg-bad/15 text-bad", info: "bg-info/15 text-info" }[tone];
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}
/** Transaction type pill: expenses glow red, income/refunds glow green, the rest stay calm. */
export function TypeBadge({ type }: { type: string }) {
  const t = type === "expense" ? "border-red-500/60 bg-red-500/15 text-red-600 shadow-[0_0_12px_rgba(239,68,68,0.55)] dark:text-red-300"
    : type === "income" || type === "refund" ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-700 shadow-[0_0_12px_rgba(16,185,129,0.55)] dark:text-emerald-300"
    : "border-line bg-surface2 text-muted";
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", t)}>{type}</span>;
}
export function Progress({ pct, tone = "brand" }: { pct: number; tone?: "brand" | "warn" | "bad" }) {
  const c = { brand: "bg-brand", warn: "bg-warn", bad: "bg-bad" }[tone];
  return <div role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-surface2"><div className={cn("h-full rounded-full", c)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}
export const PageHeader = ({ title, desc, action }: { title: string; desc?: React.ReactNode; action?: React.ReactNode }) => (
  <div className="mb-6"><Breadcrumbs />
    <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{desc && <p className="mt-1 text-sm text-muted">{desc}</p>}</div>{action}</div></div>
);
export const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-line p-8 text-center"><p className="font-medium">{title}</p>{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}{action && <div className="mt-4">{action}</div>}</div>
);
export const ErrorNote = ({ children }: { children: React.ReactNode }) => <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p>;
export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => <div className="relative overflow-x-auto"><table {...p} className={cn("w-full text-left text-sm", className)} /></div>;
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...p} className={cn("border-b border-line px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted sm:px-3", className)} />;
/** Number columns (class "tabnum") never wrap, so "+₹85,000" can't split across two lines on a phone; the table scrolls sideways instead. */
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cn("border-b border-line/60 px-2 py-2.5 [overflow-wrap:anywhere] sm:px-3", typeof className === "string" && /\btabnum\b/.test(className) && "whitespace-nowrap", className)} />;
