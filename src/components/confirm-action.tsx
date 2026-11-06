"use client";
import { useTransition } from "react";
import { askConfirm, toast } from "@/lib/feedback-bus";
import { Button } from "./ui";

/**
 * A button that runs a server action after an optional "Are you sure?" pop-up, then shows a success toast that dismisses itself.
 * For actions that have no form of their own (delete a transaction, delete a draft, mark a bill paid).
 */
export function ConfirmAction({ action, fields, confirm, success, children, variant = "ghost", size = "sm", bare, className, label, danger = true, confirmLabel }: {
  action: (fd: FormData) => Promise<unknown> | void; fields: Record<string, string>; confirm?: string; success: string; children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md"; bare?: boolean; className?: string; label?: string; danger?: boolean; confirmLabel?: string;
}) {
  const [pending, start] = useTransition();
  const run = (fd: FormData) => start(async () => { try { await action(fd); toast(success); } catch { toast("Something went wrong. Please try again.", "error", 5000); } });
  return (
    <form onSubmit={(e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      if (!confirm) return run(fd);
      void askConfirm({ message: confirm, tone: danger ? "danger" : "primary", confirmLabel }).then((ok) => { if (ok) run(fd); });
    }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {bare ? <button disabled={pending} aria-label={label} className={className}>{children}</button> : <Button variant={variant} size={size} disabled={pending} aria-label={label} className={className}>{pending ? "Working…" : children}</Button>}
    </form>
  );
}
