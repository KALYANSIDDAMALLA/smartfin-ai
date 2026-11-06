"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { changePassword } from "@/app/actions/auth";
import { toast } from "@/lib/feedback-bus";
import { Button, ErrorNote, Field, cn } from "./ui";
import { PasswordInput } from "./password-input";

/** Same strength score as the sign-up form. */
const strength = (p: string) => { let n = 0; if (p.length >= 8) n++; if (p.length >= 12) n++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++; if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) n++; return p ? Math.max(1, n) : 0; };

/** Change-password form with live validation. Fields are controlled and submitted by hand, so they are NOT cleared when the server reports an error. */
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [v, setV] = useState({ current: "", password: "", confirm: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErr, setServerErr] = useState<string>();
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setServerErr(undefined); setV((p) => ({ ...p, [k]: e.target.value })); };
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const errors: Record<string, string> = {};
  if (hasPassword && !v.current) errors.current = "Enter your current password";
  if (!v.password) errors.password = "Enter a new password";
  else if (v.password.length < 8) errors.password = "Use at least 8 characters";
  else if (v.password.length > 128) errors.password = "Use at most 128 characters";
  else if (hasPassword && v.password === v.current) errors.password = "Choose a password different from your current one";
  if (!v.confirm) errors.confirm = "Re-enter the new password";
  else if (v.confirm !== v.password) errors.confirm = "Passwords do not match";
  const err = (k: string) => (touched[k] ? errors[k] : undefined);
  const n = strength(v.password), label = ["", "Weak", "Fair", "Good", "Strong"][n], color = ["", "bg-bad", "bg-warn", "bg-info", "bg-good"][n];
  const tips: [string, boolean][] = [["8+ characters", v.password.length >= 8], ["Aa upper & lower", /[a-z]/.test(v.password) && /[A-Z]/.test(v.password)], ["Number", /\d/.test(v.password)], ["Symbol", /[^A-Za-z0-9]/.test(v.password)]];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length) { setTouched({ current: true, password: true, confirm: true }); (document.querySelector("#change-password [aria-invalid=true]") as HTMLElement | null)?.focus(); return; }
    start(async () => {
      const fd = new FormData(); if (hasPassword) fd.set("current", v.current); fd.set("password", v.password); fd.set("confirm", v.confirm);
      const r = await changePassword(undefined, fd);
      if (r?.error) { setServerErr(r.error); return; }
      toast(r?.ok ?? "Password changed."); setV({ current: "", password: "", confirm: "" }); setTouched({}); setServerErr(undefined);
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      {serverErr && <div className="mb-3"><ErrorNote>{serverErr}</ErrorNote></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {hasPassword && <Field label="Current password" error={err("current")}><PasswordInput name="current" autoComplete="current-password" value={v.current} onChange={set("current")} onBlur={blur("current")} aria-invalid={!!err("current")} /></Field>}
        <Field label="New password" error={err("password")}><PasswordInput name="password" autoComplete="new-password" maxLength={128} value={v.password} onChange={set("password")} onBlur={blur("password")} aria-invalid={!!err("password")} /></Field>
        <Field label="Re-enter new password" error={err("confirm")}><PasswordInput name="confirm" autoComplete="new-password" maxLength={128} value={v.confirm} onChange={set("confirm")} onBlur={blur("confirm")} aria-invalid={!!err("confirm")} /></Field>
      </div>
      {v.password && <div aria-live="polite" className="mt-3 grid gap-2">
        <div className="flex items-center gap-3"><div className="flex flex-1 gap-1" aria-hidden>{[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-surface2", i <= n && color)} />)}</div><p className="text-xs text-muted">Strength: <b className="text-fg">{label}</b></p></div>
        <ul aria-label="Password tips" className="flex flex-wrap gap-1.5 text-xs">{tips.map(([t, ok]) => (
          <li key={t} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition", ok ? "border-good/40 bg-good/10 text-good" : "border-line text-muted")}>{ok ? <Check size={11} aria-hidden /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />}{t}</li>))}
          <li className="px-1 py-0.5 text-muted">Only 8+ characters is required; the rest make it stronger.</li></ul></div>}
      <Button disabled={pending} className="mt-3">{pending ? "Working…" : hasPassword ? "Change password" : "Set password"}</Button>
    </form>
  );
}
