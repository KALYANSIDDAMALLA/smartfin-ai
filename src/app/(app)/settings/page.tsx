import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { saveSettings, saveNotificationPrefs } from "@/app/actions/plan";
import { DeleteAccount } from "@/components/delete-account";
import { AvatarUploader } from "@/components/avatar-uploader";
import { ProfileDetailsForm } from "@/components/profile-details-form";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";

const Check = ({ name, label, hint, on }: { name: string; label: string; hint?: string; on?: boolean }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line/70 bg-surface2/30 px-3 py-2.5 text-sm transition hover:border-brand/50">
    <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
    <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
  </label>);

export default async function Settings({ searchParams }: { searchParams: Promise<{ delete_error?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile, user } = await requireUser();
  const [{ data: pref }, signed, { data: ud }] = await Promise.all([
    supabase.from("user_preferences").select("*").maybeSingle(),
    profile.avatar_path ? supabase.storage.from("private-files").createSignedUrl(profile.avatar_path, 3600) : Promise.resolve(null),
    supabase.auth.getUser(), // fresh user record: the JWT can lag behind just-saved profile details
  ]);
  const initial = (profile.display_name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  return (
    <>
      <PageHeader title="Profile & settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2"><div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-12">
          <div><h2 className="mb-3 font-medium">Profile picture</h2><AvatarUploader currentUrl={signed?.data?.signedUrl ?? null} initial={initial} /></div>
          <div className="lg:border-l lg:border-line/70 lg:pl-12"><h2 className="mb-3 font-medium">About you</h2>
            <ProfileDetailsForm fullName={profile.display_name ?? String(ud?.user?.user_metadata?.full_name ?? "")} profession={String(ud?.user?.user_metadata?.profession ?? "")} /></div>
        </div></Card>
        <Card className="flex flex-col"><h2 className="mb-3 font-medium">Profile</h2><ActionForm stretch action={saveSettings} submit="Save settings"><div className="grid gap-3">
          <Field label="Email"><Input value={user.email ?? ""} disabled readOnly /></Field>
          <Field label="Currency" hint="INR only for now; the data model supports more."><Select name="currency" defaultValue="INR"><option value="INR">INR (₹)</option></Select></Field>
          <Field label="Time zone"><Select name="timezone" defaultValue={profile.timezone}>{["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div></ActionForm></Card>
        <Card className="flex flex-col"><h2 className="font-medium">Notifications</h2><p className="mb-3 mt-0.5 text-sm text-muted">Choose which summaries you&apos;d like. Alerts for budgets, goals and due dates always appear in your Notifications page.</p>
          <ActionForm stretch action={saveNotificationPrefs} submit="Save notification preferences"><div className="grid gap-4">
            <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Summaries</legend>
              <div className="grid gap-2 sm:grid-cols-2"><Check name="daily" label="Daily summary" on={pref?.notify_daily} /><Check name="weekly" label="Weekly summary" on={pref?.notify_weekly ?? true} /><Check name="monthly" label="Monthly summary" on={pref?.notify_monthly ?? true} /><Check name="yearly" label="Yearly summary" on={pref?.notify_yearly ?? true} /></div></fieldset>
            <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Delivery</legend>
              <div className="grid gap-2 sm:grid-cols-2"><Check name="email" label="Email" hint="Needs an email provider — not active yet" on={pref?.email_notifications} /><Check name="push" label="Browser push" hint="Not active yet" on={pref?.push_notifications} /></div></fieldset>
          </div></ActionForm></Card>
        <Card className="border-bad/30 lg:col-span-2"><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-10">
          <div><h2 className="font-medium text-bad">Delete account</h2><p className="mt-1 text-sm text-muted">Deletes your profile and all records permanently. This cannot be undone.</p>
            <p className="mt-4 text-xs text-muted"><Link href="/privacy" className="underline">Privacy policy</Link> · <Link href="/terms" className="underline">Terms</Link> · <Link href="/contact" className="underline">Contact</Link></p></div>
          <div>{sp.delete_error && <p role="alert" className="mt-2 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{sp.delete_error === "rate" ? "Too many attempts. Please wait a few minutes and try again." : sp.delete_error === "reason" ? "Please choose a reason." : sp.delete_error === "config" ? "Account deletion isn't available yet: the server is missing its admin key. Ask the site owner to finish setup." : "We couldn't delete your account. Please try again."}</p>}
            <DeleteAccount /></div>
        </div></Card>
      </div>
    </>
  );
}
