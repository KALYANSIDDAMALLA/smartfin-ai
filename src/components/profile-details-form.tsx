"use client";
import { useActionState, useState } from "react";
import { Button, ErrorNote, Field, Input } from "./ui";
import { Select } from "./select";
import { saveProfileDetails } from "@/app/actions/profile";
import { toast } from "@/lib/feedback-bus";
import { checkName } from "@/lib/validate";
import { PROFESSIONS } from "@/lib/professions";
import type { FormState } from "@/app/actions/auth";

const save = async (p: FormState, fd: FormData) => { const r = await saveProfileDetails(p, fd); if (r?.ok) toast(r.ok); return r; };

/** Full name + profession, shown beside the profile picture. Checked as you leave the field and again on the server. */
export function ProfileDetailsForm({ fullName, profession }: { fullName: string; profession: string }) {
  const [state, action, pending] = useActionState(save, undefined);
  const [err, setErr] = useState<string | null>(null);
  const options = profession && !PROFESSIONS.includes(profession) ? [profession, ...PROFESSIONS] : PROFESSIONS;
  return (
    <form action={action} noValidate onSubmit={(e) => { const m = checkName("Full name", String(new FormData(e.currentTarget).get("fullName") ?? ""), { min: 2, max: 80, required: true }); setErr(m); if (m) { e.preventDefault(); (e.currentTarget.elements.namedItem("fullName") as HTMLElement | null)?.focus(); } }} className="grid gap-3">
      {state?.error && !err && <ErrorNote>{state.error}</ErrorNote>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" error={err ?? state?.fields?.fullName}><Input name="fullName" defaultValue={fullName} maxLength={80} autoComplete="name" placeholder="e.g. Rohan Mehta" aria-invalid={!!(err ?? state?.fields?.fullName)}
          onBlur={(e) => setErr(checkName("Full name", e.target.value, { min: 2, max: 80, required: true }))} onChange={() => err && setErr(null)} /></Field>
        <Field label="Profession" hint="Helps tailor suggestions. You can leave it blank."><Select name="profession" defaultValue={profession} aria-label="Profession"><option value="">Select your profession…</option>{options.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
      </div>
      <div><Button disabled={pending}>{pending ? "Saving…" : "Save details"}</Button></div>
    </form>
  );
}
