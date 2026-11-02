"use client";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { checkBalance } from "@/app/actions/integrations";
import { formatMoney } from "@/lib/finance/money";
import { toast } from "@/lib/feedback-bus";

/** UPI-style "Check balance": hidden by default, shown on tap, and hides itself again after 30 seconds. */
export function CheckBalance({ connectionId, currency, timezone }: { connectionId: string; currency: string; timezone: string }) {
  const [bal, setBal] = useState<{ minor: number; at: string } | null>(null); const [pending, start] = useTransition();
  useEffect(() => { if (!bal) return; const t = setTimeout(() => setBal(null), 30_000); return () => clearTimeout(t); }, [bal]);
  const reveal = () => start(async () => {
    const r = await checkBalance(connectionId);
    if ("error" in r) toast(r.error, "error", 5000); else setBal({ minor: r.balanceMinor, at: r.asOf });
  });
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="text-right"><p className="tabnum text-base font-semibold">{bal ? formatMoney(bal.minor, currency) : "₹ ••••••"}</p>
        {bal && <p className="text-[11px] text-muted">as of {new Date(bal.at).toLocaleTimeString("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}</p>}</div>
      <button type="button" onClick={bal ? () => setBal(null) : reveal} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium transition hover:border-brand/50 hover:bg-brand/10 disabled:opacity-60">
        {bal ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}{pending ? "Checking…" : bal ? "Hide" : "Check balance"}</button>
    </div>
  );
}
