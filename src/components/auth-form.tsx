"use client";
import { useActionState, useId, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, Phone, User, type LucideIcon } from "lucide-react";
import { Button, ErrorNote, cn, inputCls } from "./ui";
import { resendVerification, verifyEmailCode, type FormState } from "@/app/actions/auth";
import { RECAPTCHA_SITE_KEY, Recaptcha } from "./recaptcha";

type Mode = "login" | "register" | "forgot" | "reset";
type Values = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?\d{7,15}$/;
/** Client-side checks mirror the server's rules (the server re-validates everything). */
function validate(mode: Mode, v: Values): Values {
  const e: Values = {};
  if (mode === "register") {
    if (!v.firstName?.trim()) e.firstName = "First name is required";
    if (!v.lastName?.trim()) e.lastName = "Last name is required";
    const ph = (v.phone ?? "").replace(/[\s()-]/g, "");
    if (ph && !PHONE.test(ph)) e.phone = "Enter 7–15 digits, with an optional + country code";
    if (v.terms !== "on") e.terms = "Please agree to the Terms and Privacy Policy to continue";
  }
  if (mode !== "reset") { if (!v.email?.trim()) e.email = "Email is required"; else if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid email address"; }
  if (mode === "login") { if (!v.password) e.password = "Password is required"; }
  if (mode === "register" || mode === "reset") {
    const p = v.password ?? "";
    if (!p) e.password = "Password is required";
    else if (p.length < 8) e.password = "Use at least 8 characters";
    if (!v.confirm) e.confirm = "Re-enter your password";
    else if (v.confirm !== p) e.confirm = "Passwords do not match";
  }
  return e;
}

function strength(p: string) {
  let n = 0; if (p.length >= 8) n++; if (p.length >= 12) n++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++; if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) n++;
  return p ? Math.max(1, n) : 0;
}
const SUB = { login: "Log in to your dashboard.", register: "Start tracking your money in under a minute.", forgot: "Enter your email and we'll send a reset link.", reset: "Pick a strong password you haven't used before." } as const;

function AuthField({ id, label, icon: Icon, error, hint, children, trailing, aside }: { id: string; label: string; icon: LucideIcon; error?: string; hint?: string; children: React.ReactNode; trailing?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex items-baseline justify-between gap-2"><label htmlFor={id} className="font-medium">{label}</label>{aside}</div>
      <div className="relative">
        <Icon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
        {children}
        {trailing && <div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2">{trailing}</div>}
      </div>
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-bad">{error}</p> : hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function AuthForm({ mode, action, next }: { mode: Mode; action: (s: FormState, f: FormData) => Promise<FormState>; next?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const uid = useId();
  const [v, setV] = useState<Values>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState({ password: false, confirm: false });
  const errors = validate(mode, v);
  const [resend, startResend] = useTransition();
  const [resendMsg, setResendMsg] = useState<string>(); const [captchaErr, setCaptchaErr] = useState<string>();
  const sent = mode === "register" && !!state?.ok;
  const chip = "inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-medium transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50";
  const [code, setCode] = useState(""); const [codeErr, setCodeErr] = useState<string>(); const [checking, startCheck] = useTransition();
  const doVerify = () => { if (!/^\d{6}$/.test(code)) { setCodeErr("Enter the 6-digit code"); return; } setCodeErr(undefined);
    startCheck(async () => { const fd = new FormData(); fd.set("email", v.email ?? ""); fd.set("code", code); const r = await verifyEmailCode(undefined, fd); if (r?.error) setCodeErr(r.error); }); };
  const doResend = () => startResend(async () => { const fd = new FormData(); fd.set("email", v.email ?? ""); const r = await resendVerification(undefined, fd); setResendMsg(r?.error ?? r?.ok); });
  const title = { login: "Log in", register: "Create your account", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: k === "phone" ? e.target.value.replace(/[^\d+\-\s()]/g, "") : e.target.value })); // no letters in the phone number
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const err = (k: string) => (touched[k] ? errors[k] : undefined);
  const props = (k: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => ({
    id: `${uid}-${k}`, name: k, value: v[k] ?? "", onChange: set(k), onBlur: blur(k), "aria-invalid": !!err(k), "aria-describedby": err(k) ? `${uid}-${k}-err` : undefined,
    className: cn(inputCls, "h-10 pl-9", err(k) && "border-bad focus-visible:outline-bad"), ...extra,
  });
  const pw = (k: "password" | "confirm", label: string, auto: string, hint?: string) => (
    <AuthField id={`${uid}-${k}`} label={label} icon={Lock} error={err(k)} hint={hint} aside={mode === "login" && k === "password" ? <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">Forgot password?</Link> : undefined}>
      <input {...props(k, { type: show[k] ? "text" : "password", autoComplete: auto, placeholder: k === "confirm" ? "Repeat your password" : mode === "login" ? "Enter your password" : "At least 8 characters" })} className={cn(inputCls, "h-10 pl-9 pr-10", err(k) && "border-bad focus-visible:outline-bad")} />
      <button type="button" onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} aria-label={show[k] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={show[k]}
        className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-md p-1.5 text-muted hover:bg-surface2 hover:text-fg">{show[k] ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </AuthField>
  );
  const wide = mode === "register" || mode === "reset";
  const full = "sm:col-span-2";
  return (
    <form action={formAction} noValidate className={cn("grid gap-2.5", wide && "sm:grid-cols-2")}
      onSubmit={(e) => {
        if (mode === "register" && RECAPTCHA_SITE_KEY && !String(new FormData(e.currentTarget).get("g-recaptcha-response") ?? "")) { setCaptchaErr("Please tick “I'm not a robot”."); setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true]))); e.preventDefault(); return; }
        setCaptchaErr(undefined);
        if (Object.keys(errors).length) { e.preventDefault(); setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true]))); (e.currentTarget.querySelector("[aria-invalid=true]") as HTMLElement | null)?.focus(); } }}>
      <div className={full}><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-0.5 text-sm text-muted">{SUB[mode]}</p></div>
      {state?.error && <div className={full}><ErrorNote>{state.error}</ErrorNote></div>}
      {state?.ok && <p role="status" className={cn("rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-good", full)}>{state.ok}</p>}
      {mode === "register" && <>
        <AuthField id={`${uid}-firstName`} label="First name" icon={User} error={err("firstName")}><input {...props("firstName", { autoComplete: "given-name", maxLength: 50, placeholder: "e.g. Priya" })} /></AuthField>
        <AuthField id={`${uid}-lastName`} label="Last name" icon={User} error={err("lastName")}><input {...props("lastName", { autoComplete: "family-name", maxLength: 50, placeholder: "e.g. Sharma" })} /></AuthField></>}
      {mode !== "reset" && <div className={full}><AuthField id={`${uid}-email`} label="Email" icon={Mail} error={err("email")} hint={sent ? (resendMsg ?? "We emailed you a 6-digit code. Enter it below.") : undefined}
        trailing={mode === "register" && (sent
          ? <button type="button" onClick={doResend} disabled={resend} className={chip}><Check size={12} className="text-good" aria-hidden />{resend ? "Sending…" : "Resend"}</button>
          : <button type="submit" disabled={pending} className={cn(chip, "text-brand")} aria-label="Verify email: create account and send a verification link">{pending ? "Sending…" : "Verify"}</button>)}>
        <input {...props("email", { type: "email", autoComplete: "email", inputMode: "email", placeholder: "name@example.com", ...(mode === "register" ? { className: cn(inputCls, "h-10 pl-9 pr-24", err("email") && "border-bad focus-visible:outline-bad") } : {}) })} /></AuthField></div>}
      {mode === "register" && <div className={full}><AuthField id={`${uid}-phone`} label="Phone (optional)" icon={Phone} error={err("phone")}
        trailing={<button type="button" disabled title="Phone verification needs an SMS provider, which isn't set up yet" aria-label="Verify phone (unavailable: no SMS provider configured)" className={chip}>Verify</button>}>
        <input {...props("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 20, placeholder: "+91 98765 43210", className: cn(inputCls, "h-10 pl-9 pr-24", err("phone") && "border-bad focus-visible:outline-bad") })} /></AuthField></div>}
      {sent && <div className={full}><AuthField id={`${uid}-code`} label="6-digit verification code" icon={Check} error={codeErr}
        trailing={<button type="button" onClick={doVerify} disabled={checking || code.length !== 6} className={cn(chip, "text-brand")}>{checking ? "Checking…" : "Verify code"}</button>}>
        <input id={`${uid}-code`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" aria-invalid={!!codeErr}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doVerify(); } }} className={cn(inputCls, "h-10 pl-9 pr-28 tracking-[0.3em]", codeErr && "border-bad")} /></AuthField></div>}
      {mode !== "forgot" && <div className={wide ? "" : full}>{pw("password", mode === "reset" ? "New password" : "Password", mode === "login" ? "current-password" : "new-password")}</div>}
      {wide && <div>{pw("confirm", "Re-enter password", "new-password")}</div>}
      {wide && v.password && (() => { const n = strength(v.password); const l = ["", "Weak", "Fair", "Good", "Strong"][n]; const c = ["", "bg-bad", "bg-warn", "bg-info", "bg-good"][n];
        return <div aria-live="polite" className={cn("flex items-center gap-3", full)}><div className="flex flex-1 gap-1" aria-hidden>{[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-surface2", i <= n && c)} />)}</div><p className="text-xs text-muted">Strength: <b className="text-fg">{l}</b></p></div>; })()}
      {wide && <ul aria-label="Password tips" className={cn("flex flex-wrap gap-1.5 text-xs", full)}>
        {([["8+ characters", (v.password ?? "").length >= 8], ["Aa upper & lower", /[a-z]/.test(v.password ?? "") && /[A-Z]/.test(v.password ?? "")], ["Number", /\d/.test(v.password ?? "")], ["Symbol", /[^A-Za-z0-9]/.test(v.password ?? "")]] as [string, boolean][]).map(([t, ok]) => (
          <li key={t} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition", ok ? "border-good/40 bg-good/10 text-good" : "border-line text-muted")}>{ok ? <Check size={11} aria-hidden /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />}{t}</li>))}
        <li className="px-1 py-0.5 text-muted">Only 8+ characters is required; the rest make it stronger.</li>
      </ul>}
      {mode === "register" && !sent && <div className={cn("grid gap-3", full)}>
        <div className="grid gap-1">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" name="terms" value="on" checked={v.terms === "on"} onChange={(e) => setV((p) => ({ ...p, terms: e.target.checked ? "on" : "" }))} onBlur={blur("terms")} aria-invalid={!!err("terms")} aria-describedby={err("terms") ? `${uid}-terms-err` : undefined}
              className={cn("mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]", err("terms") && "outline outline-2 outline-bad")} />
            <span>I agree to the <Link href="/terms" target="_blank" rel="noopener" className="font-medium text-brand hover:underline">Terms &amp; Conditions</Link> and the <Link href="/privacy" target="_blank" rel="noopener" className="font-medium text-brand hover:underline">Privacy Policy</Link>.</span>
          </label>
          {err("terms") && <p id={`${uid}-terms-err`} role="alert" className="text-xs text-bad">{err("terms")}</p>}
        </div>
        <Recaptcha resetSignal={state} error={captchaErr} onSolve={() => setCaptchaErr(undefined)} />
      </div>}
      {next && <input type="hidden" name="next" value={next} />}
      <div className={full}><Button disabled={pending || sent} className="h-10 w-full">{sent ? "Check your email to continue" : pending ? "Please wait…" : <>{title}<ArrowRight size={16} aria-hidden /></>}</Button></div>
      {mode === "forgot" && <div className={cn("flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm text-muted", full)}><Link href="/login" className="text-brand hover:underline">← Back to log in</Link></div>}
    </form>
  );
}
