"use client";
import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "@/lib/feedback-bus";
import { Button, ErrorNote } from "./ui";
import { createSmsToken, revokeSmsToken } from "@/app/actions/sms";
import type { FormState } from "@/app/actions/auth";

const copy = (v: string, what: string) => { void navigator.clipboard?.writeText(v).then(() => toast(`${what} copied`), () => toast("Copy failed. Select and copy it by hand.", "error")); };

/** Shows the private endpoint + token (token only right after creating it) and phone setup steps. */
export function SmsForward({ active, hint, lastUsed, count }: { active: boolean; hint?: string; lastUsed?: string; count?: number }) {
  const [made, make, making] = useActionState(async () => createSmsToken(), undefined as FormState);
  const [off, turnOff, turningOff] = useActionState(async () => revokeSmsToken(), undefined as FormState);
  const [os, setOs] = useState<"android" | "iphone">("android");
  const token = made?.fields?.token; const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/sms/ingest`;
  const body = '{"message": "<SMS text>"}';
  return (
    <div className="grid gap-4">
      {(made?.error || off?.error) && <ErrorNote>{made?.error ?? off?.error}</ErrorNote>}
      {!active && !token && <form action={make}><Button disabled={making}>{making ? "Working…" : "Turn on instant SMS alerts"}</Button></form>}
      {active && !token && <p className="text-sm text-muted">On · token ends in <code>…{hint}</code> · {count ?? 0} alert{count === 1 ? "" : "s"} received{lastUsed ? ` · last ${lastUsed}` : " · none yet"}</p>}
      {token && <div role="status" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><b>Copy your token now. It is shown only once.</b>
        <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1.5 text-xs">{token}</code><Button type="button" variant="outline" size="sm" onClick={() => copy(token, "Token")}><Copy size={14} aria-hidden /> Copy</Button></div></div>}
      {(active || token) && <>
        <div className="grid gap-1 text-sm"><span className="text-muted">Send each bank SMS to this address (POST):</span>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1.5 text-xs">{url}</code><Button type="button" variant="outline" size="sm" onClick={() => copy(url, "Address")}><Copy size={14} aria-hidden /> Copy</Button></div></div>
        <div role="tablist" className="flex gap-2">{(["android", "iphone"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={os === k} onClick={() => setOs(k)} className={`h-9 rounded-lg border px-3 text-sm font-medium ${os === k ? "border-brand bg-brand/10 text-brand" : "border-line text-muted"}`}>{k === "android" ? "Android" : "iPhone"}</button>)}</div>
        {os === "android" ? <ol className="ml-5 list-decimal space-y-1 text-sm text-muted">
          <li>Install an SMS-forwarding automation app (for example <b>MacroDroid</b>, <b>Tasker</b> or <b>SMS Forwarder</b>) and allow it to read SMS.</li>
          <li>Trigger: <b>SMS received</b>, from your bank&apos;s sender (e.g. contains <code>debited</code> or <code>credited</code>).</li>
          <li>Action: <b>HTTP POST</b> to the address above. Header <code>Authorization: Bearer YOUR_TOKEN</code>, content type <code>application/json</code>, body <code>{body}</code> (use the app&apos;s &quot;SMS text&quot; variable).</li></ol>
        : <ol className="ml-5 list-decimal space-y-1 text-sm text-muted">
          <li>Open <b>Shortcuts → Automation → New → Message</b>. Set <b>Message Contains</b> <code>debited</code>, and make a second one for <code>credited</code>. Choose <b>Run Immediately</b>.</li>
          <li>Add the action <b>Get Contents of URL</b>: the address above, Method <b>POST</b>, header <code>Authorization</code> = <code>Bearer YOUR_TOKEN</code>, Request Body <b>JSON</b> with a Text field <code>message</code> = <b>Shortcut Input</b>.</li>
          <li>iOS may ask permission the first time. Turn off &quot;Ask Before Running&quot;.</li></ol>}
        <p className="text-xs text-muted">Alerts land in <b>Imports</b> for you to confirm (nothing is added to your totals until you do). OTP messages are ignored and never stored. Your token works like a password: anyone with it can add alerts to your account, so replace it if it leaks.</p>
        <div className="flex flex-wrap gap-2">
          <form action={make}><Button variant="outline" size="sm" disabled={making}>{making ? "Working…" : "Replace token"}</Button></form>
          <form action={turnOff}><Button variant="danger" size="sm" disabled={turningOff}>{turningOff ? "Working…" : "Turn off"}</Button></form></div></>}
    </div>
  );
}
