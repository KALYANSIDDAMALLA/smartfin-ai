"use client";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { BANKS, bankHue, bankLogoUrl } from "@/lib/banks";
import { connectBank } from "@/app/actions/integrations";
import { ActionForm } from "./action-form";
import { Dropdown, type Opt } from "./dropdown";
import { Field, inputCls, cn } from "./ui";

const BANK_OPTS: Opt[] = BANKS.map((b) => ({ value: b.id, label: b.name, group: b.group, icon: Landmark, hue: bankHue(b.name), logo: bankLogoUrl(b.id) }));
const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

/** "Link a bank" the way payment apps do it: choose your bank, enter the mobile number linked to it, agree, and approve on the bank-data provider's secure page (works on a phone or a computer). */
export function BankLinkForm({ enabled }: { enabled: boolean }) {
  const [bank, setBank] = useState(""); const [mobile, setMobile] = useState(""); const ready = !!bank && /^[6-9]\d{9}$/.test(mobile);
  return (
    <fieldset disabled={!enabled} className={cn("min-w-0 border-0 p-0", !enabled && "opacity-60")}>
      <ActionForm action={connectBank} submit="Continue to bank approval">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="1. Choose your bank"><Dropdown name="bank" value={bank} onChange={setBank} options={BANK_OPTS} searchable placeholder="Search and select your bank…" ariaLabel="Your bank" /></Field>
          <Field label="2. Mobile number linked to that bank" hint="The number your bank has on record. You will get an OTP on it.">
            <div className="relative"><span aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-muted">+91</span>
              <input name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" value={mobile} onChange={(e) => setMobile(digits(e.target.value, 10))} className={cn(inputCls, "pl-11")} /></div></Field>
        </div>
        <label className="mt-3 flex items-start gap-2.5 text-sm"><input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-indigo-600" />
          <span>I agree to share my <b>account summary and transactions for the last 12 months</b> with SmartFin AI through an RBI-regulated Account Aggregator. I can stop sharing at any time.</span></label>
        {!ready && enabled && <p className="mt-2 text-xs text-muted">Choose a bank and enter your 10-digit mobile number to continue.</p>}
      </ActionForm>
    </fieldset>
  );
}
