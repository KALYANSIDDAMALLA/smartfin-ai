"use client";
import { useActionState, useRef } from "react";
import { askConfirm, toast } from "@/lib/feedback-bus";
import { Button, ErrorNote } from "./ui";
import type { FormState } from "@/app/actions/auth";

/** Form that shows server validation errors / success. Optional confirm() for destructive actions. */
export function ActionForm({ action, children, submit = "Save", className, variant = "primary", confirm, compact, stretch }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>; children?: React.ReactNode; submit?: string; className?: string;
  variant?: "primary" | "outline" | "ghost" | "danger"; confirm?: string;
  /** Button-only form used in a row of actions: same small size as its neighbours and no extra top margin. */
  compact?: boolean;
  /** Fill the card and pin the button to its bottom, so side-by-side cards line up. */
  stretch?: boolean;
}) {
  // Success shows as a toast that dismisses itself. It is raised here (not in an effect) so it still appears when the action removes this very form (e.g. Delete).
  const [state, run, pending] = useActionState(async (s: FormState, fd: FormData) => { const r = await action(s, fd); if (r?.ok) toast(r.ok); if (r?.error && compact) toast(r.error, "error", 5000); return r; }, undefined);
  const confirmed = useRef(false);
  return (
    <form action={run} className={stretch ? `flex flex-1 flex-col ${className ?? ""}` : className} onSubmit={(e) => {
      if (!confirm || confirmed.current) { confirmed.current = false; return; } // already confirmed: let it through
      e.preventDefault(); const form = e.currentTarget; const danger = variant === "danger";
      void askConfirm({ message: confirm, tone: danger ? "danger" : "primary", confirmLabel: danger ? `Yes, ${submit.toLowerCase()}` : "Yes, continue" }).then((ok) => { if (ok) { confirmed.current = true; form.requestSubmit(); } });
    }}>
      {state?.error && !compact && <div className="mb-2"><ErrorNote>{state.error}</ErrorNote></div>}
      {stretch ? <div className="flex-1">{children}</div> : children}
      <Button variant={variant} size={compact ? "sm" : "md"} disabled={pending} className={compact ? undefined : stretch ? "mt-5 self-start" : "mt-3"}>{pending ? "Working…" : submit}</Button>
    </form>
  );
}
