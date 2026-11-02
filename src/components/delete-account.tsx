"use client";
import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Select, Textarea } from "./ui";

const REASONS = ["I no longer need it", "I'm switching to another app", "Privacy concerns", "It's too complicated to use", "Missing features I need", "I created it by mistake", "Other"];

/** Reason + confirmation pop-up. The form posts only after the user confirms in the dialog. */
export function DeleteAccount() {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [reason, setReason] = useState(""); const [detail, setDetail] = useState(""); const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ask = () => {
    if (!reason) { setErr("Please choose a reason."); return; }
    setErr(undefined); dialog.current?.showModal();
  };
  return (
    <>
      <form ref={form} action="/api/account/delete" method="post" className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
        <Field label="Why are you deleting your account?">
          <Select name="reason" value={reason} onChange={(e) => { setReason(e.target.value); setErr(undefined); }} aria-invalid={!!err} required>
            <option value="">Select a reason…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
        </Field>
        {reason === "Other" && <Field label="Tell us more (optional)"><Textarea name="detail" rows={2} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>}
        {err && <p role="alert" className="text-xs text-bad">{err}</p>}
        <Button type="button" variant="danger" onClick={ask} className="w-full">Delete my account</Button>
      </form>

      <dialog ref={dialog} aria-labelledby="del-title" aria-describedby="del-desc" className="pop m-auto w-[min(92vw,26rem)] rounded-2xl p-6 text-fg backdrop:bg-black/40 backdrop:backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bad/15 text-bad"><AlertTriangle size={20} aria-hidden /></span>
          <div><h2 id="del-title" className="text-lg font-semibold">Are you sure you want to delete your account?</h2>
            <p id="del-desc" className="mt-1 text-sm text-muted">Your profile, transactions, budgets, goals and files will be permanently deleted. This can&apos;t be undone.</p></div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()} disabled={busy} autoFocus>Cancel</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => { setBusy(true); form.current?.submit(); }}>{busy ? "Deleting…" : "Yes, delete"}</Button>
        </div>
      </dialog>
    </>
  );
}
