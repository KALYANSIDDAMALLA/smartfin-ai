"use client";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { balancePinState, checkAccountBalance, setBalancePin } from "@/app/actions/balance";
import { formatMoney } from "@/lib/finance/money";
import { Input } from "./ui";

type Step = "closed" | "loading" | "enter" | "create" | "change";
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** UPI-style "Check balance": hidden until you enter your PIN, then shown for 30 seconds. First use creates the PIN. */
export function AccountBalance({ accountId, currency, timezone }: { accountId: string; currency: string; timezone: string }) {
  const [step, setStep] = useState<Step>("closed"); const [pin, setPin] = useState(""); const [pin2, setPin2] = useState(""); const [cur, setCur] = useState("");
  const [err, setErr] = useState(""); const [bal, setBal] = useState<{ minor: number; at: string } | null>(null); const [pending, start] = useTransition();
  useEffect(() => { if (!bal) return; const t = setTimeout(() => setBal(null), 30_000); return () => clearTimeout(t); }, [bal]);
  const reset = () => { setPin(""); setPin2(""); setCur(""); setErr(""); };
  const close = () => { reset(); setStep("closed"); };
  const open = () => start(async () => {
    reset(); setStep("loading"); const s = await balancePinState();
    if ("error" in s) { setErr(s.error); setStep("enter"); return; }
    setStep(s.set ? "enter" : "create");
  });
  const reveal = (p: string) => start(async () => {
    const r = await checkAccountBalance(accountId, p);
    if ("error" in r) { setErr(r.error); setPin(""); return; }
    setBal({ minor: r.balanceMinor, at: r.asOf }); close();
  });
  const create = () => start(async () => {
    if (pin !== pin2) { setErr("The two PINs don't match."); return; }
    const r = await setBalancePin(pin, step === "change" ? cur : undefined);
    if ("error" in r) { setErr(r.error); return; }
    if (step === "change") { reset(); setErr(""); setStep("enter"); return; }
    reveal(pin);
  });

  if (bal) return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface/50 px-3 py-2" aria-live="polite">
      <div><p className="tabnum text-base font-semibold">{formatMoney(bal.minor, currency)}</p>
        <p className="text-[11px] text-muted">Estimated from your records · as of {new Date(bal.at).toLocaleTimeString("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}</p></div>
      <button type="button" onClick={() => setBal(null)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium hover:border-brand/50"><EyeOff size={14} aria-hidden />Hide</button>
    </div>);

  if (step === "closed") return (
    <div className="mt-2 flex items-center gap-2"><span className="tabnum text-sm text-muted" aria-hidden>₹ ••••••</span>
      <button type="button" onClick={open} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition hover:border-brand/50 hover:bg-brand/10 disabled:opacity-60"><Eye size={14} aria-hidden />Check balance</button></div>);

  const creating = step === "create" || step === "change";
  return (
    <form className="mt-2 grid gap-2 rounded-lg border border-line bg-surface/50 p-3" onSubmit={(e) => { e.preventDefault(); setErr(""); if (creating) create(); else reveal(pin); }}>
      <p className="flex items-center gap-1.5 text-xs font-medium"><KeyRound size={13} aria-hidden />{step === "create" ? "Create a PIN to protect your balances (4–6 digits)" : step === "change" ? "Change your PIN" : "Enter your PIN"}</p>
      {step === "loading" ? <p className="text-xs text-muted">One moment…</p> : (<>
        {step === "change" && <Input type="password" inputMode="numeric" autoComplete="off" placeholder="Current PIN" aria-label="Current PIN" value={cur} onChange={(e) => setCur(digits(e.target.value))} />}
        <Input type="password" inputMode="numeric" autoComplete="off" autoFocus placeholder={creating ? "New PIN" : "PIN"} aria-label="PIN" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        {creating && <Input type="password" inputMode="numeric" autoComplete="off" placeholder="Repeat PIN" aria-label="Repeat PIN" value={pin2} onChange={(e) => setPin2(digits(e.target.value))} />}
        {err && <p role="alert" className="text-xs text-bad">{err}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending || pin.length < 4} className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-xs font-medium text-white disabled:opacity-60">{pending ? "Checking…" : creating ? (step === "change" ? "Save PIN" : "Create PIN & show") : "Show balance"}</button>
          <button type="button" onClick={close} className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted hover:text-fg">Cancel</button>
          {step === "enter" && <button type="button" onClick={() => { reset(); setStep("change"); }} className="ml-auto text-xs text-brand underline">Change PIN</button>}
        </div></>)}
    </form>);
}
