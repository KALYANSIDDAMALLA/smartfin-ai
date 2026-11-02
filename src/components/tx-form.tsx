"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Globe, RotateCcw, SlidersHorizontal, Sparkles, Store, Tag, Wand2, TrendingDown, TrendingUp } from "lucide-react";
import { Button, Field, Input, Textarea, ErrorNote, cn, inputCls } from "./ui";
import { Dropdown, type Opt } from "./dropdown";
import { NumInput } from "./num-input";
import { MerchantField, type MerchantOpt } from "./merchant-field";
import { checkAmount, checkDate, checkName, checkNote, normalizeTags, type Check } from "@/lib/validate";
import { categoryVisual, methodVisual } from "@/lib/ui-visuals";
import { saveTransaction } from "@/app/actions/transactions";
import { saveDraft } from "@/app/actions/drafts";
import { toast } from "@/lib/feedback-bus";
import type { FormState } from "@/app/actions/auth";
import { suggestFields } from "@/app/actions/suggest";
import type { Suggestion } from "@/lib/finance/suggest";
import type { Lookups } from "@/lib/server/data";

type Initial = { id?: string; draftId?: string; type?: string; amount?: string; occurredAt?: string; name?: string; merchant?: string; description?: string; notes?: string; categoryId?: string; paymentMethodId?: string; channel?: string; tags?: string; externalRef?: string };
/** Which suggested fields may be applied: only those the user has not touched. */
const pickFields = (s: Suggestion, t: { cat: boolean; method: boolean; channel: boolean }) => ({
  cat: s.categoryId && !t.cat ? s.categoryId : undefined, method: s.paymentMethodId && !t.method ? s.paymentMethodId : undefined, channel: s.channel && !t.channel ? s.channel : undefined,
});
// Success is announced as a toast that dismisses itself (raised here so it appears even if the page re-renders).
const saveTx = async (p: FormState, fd: FormData) => { const r = await saveTransaction(p, fd); if (r?.ok) toast(r.ok); return r; };
const saveDr = async (p: FormState, fd: FormData) => { const r = await saveDraft(p, fd); if (r?.ok) toast(r.ok); return r; };
const TYPE_OPTS: Opt[] = [{ value: "expense", label: "Expense", sub: "Money you spent", icon: ArrowUpRight, hue: 350 }, { value: "income", label: "Income", sub: "Money you received", icon: ArrowDownLeft, hue: 150 },
  { value: "refund", label: "Refund", sub: "Money returned to you", icon: RotateCcw, hue: 200 }, { value: "adjustment", label: "Adjustment", sub: "Correct a balance", icon: SlidersHorizontal, hue: 40 }];
const CHANNEL_OPTS: Opt[] = [{ value: "", label: "Auto", sub: "Follows the payment method", icon: Wand2, hue: 265 }, { value: "online", label: "Online", sub: "UPI, cards, net banking…", icon: Globe, hue: 210 }, { value: "offline", label: "Offline", sub: "Cash and in-person", icon: Store, hue: 140 }];
const DIRECTION_OPTS: Opt[] = [{ value: "in", label: "Adds money", icon: TrendingUp, hue: 150 }, { value: "out", label: "Removes money", icon: TrendingDown, hue: 350 }];
/** Highlight for fields the reader filled in, so it is obvious what to double-check. */
const autoCls = "border-brand/60 bg-brand/5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_14%,transparent)]";
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function TxForm({ lookups, fixedType, initial, defaultChannel, expenses = [], auto = [], merchants = [] }: { lookups: Lookups; fixedType?: "expense" | "income"; initial?: Initial; defaultChannel?: "online" | "offline"; expenses?: { id: string; label: string }[]; auto?: string[]; merchants?: MerchantOpt[] }) {
  const a = (...k: string[]) => k.some((x) => auto.includes(x)); const [errs, setErrs] = useState<Record<string, string>>({});
  const merchantLabel = "Merchant / recipient";
  // `d` is true for a draft, false when saving a real transaction, and undefined on blur. "Required" and the future-date rule apply only when
  // actually saving: a message appearing on blur would shift the buttons and swallow the click on "Save as draft".
  const rules: Record<string, (v: string, draft?: boolean) => Check> = {
    amount: (v, d) => checkAmount(v, { required: d === false }),
    merchant: (v) => checkName(merchantLabel, v, { payee: true }),
    name: (v) => checkName("Name", v, { max: 100 }),
    occurredAt: (v, d) => checkDate(v, { required: d === false, allowFuture: d !== false }),
    tags: (v) => normalizeTags(v).error,
    description: (v) => checkNote("Description", v, 1000),
    notes: (v) => checkNote("Notes", v, 2000),
  };
  const check = (k: string, v: string) => setErrs((p) => ({ ...p, [k]: rules[k](v) ?? "" }));            // when you leave a field
  const clear = (k: string) => { if (errs[k]) setErrs((p) => ({ ...p, [k]: "" })); };                    // as soon as you edit it again
  const [showName, setShowName] = useState(false); const [refundOf, setRefundOf] = useState(""); const [direction, setDirection] = useState("in");
  const [state, action, pending] = useActionState(saveTx, undefined);
  const [dState, dAction, dPending] = useActionState(saveDr, undefined);
  const [type, setType] = useState(initial?.type ?? fixedType ?? "expense");
  // Name is an optional label: hidden unless it differs from the merchant (or there is no merchant to fall back on).
  const nameIsLabel = !!initial?.name && initial.name !== initial.merchant; const nameVisible = showName || nameIsLabel || type === "adjustment" || type === "refund";
  const cats = lookups.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense"));
  const methods = defaultChannel ? lookups.methods.filter((m) => m.channel === defaultChannel) : lookups.methods;

  // ---- Smart auto-fill: suggestions only ever fill fields the user hasn't touched, and can be undone.
  const [cat, setCat] = useState(initial?.categoryId ?? ""); const [method, setMethod] = useState(initial?.paymentMethodId ?? ""); const [channel, setChannel] = useState(initial?.channel ?? defaultChannel ?? "");
  const touched = useRef({ cat: !!initial?.categoryId, method: !!initial?.paymentMethodId, channel: !!(initial?.channel ?? defaultChannel) });
  const [applied, setApplied] = useState<{ s: Suggestion; prev: { cat: string; method: string; channel: string } } | null>(null);
  const latest = useRef(""); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const kind = (type === "income" ? "income" : "expense") as "income" | "expense";
  const err = (k: string) => errs[k] || state?.fields?.[k] || dState?.fields?.[k] || undefined;
  const apply = (s: Suggestion, prev: { cat: string; method: string; channel: string }) => {
    const p = pickFields(s, touched.current);
    if (p.cat) setCat(p.cat); if (p.method) setMethod(p.method); if (p.channel) setChannel(p.channel);
    if (p.cat || p.method || p.channel) setApplied({ s, prev });
  };
  const run = async (text: string) => {
    latest.current = text; const s = await suggestFields(text, kind);
    if (s && latest.current === text) apply(s, { cat, method, channel }); // ignore stale responses
  };
  const onText = (v: string) => { clearTimeout(timer.current); if (v.trim().length >= 3 && type !== "refund" && type !== "adjustment") timer.current = setTimeout(() => run(v), 600); };
  const startText = initial?.merchant || initial?.name; const startHasCat = !!initial?.categoryId; const startMethod = initial?.paymentMethodId ?? ""; const startChannel = initial?.channel ?? defaultChannel ?? "";
  // Runs once on mount (e.g. after "Read message" pre-fills the merchant) to suggest the missing category.
  useEffect(() => {
    if (!startText || startHasCat) return; let live = true;
    void suggestFields(startText, kind).then((s) => {
      if (!live || !s) return; const p = pickFields(s, touched.current);
      if (p.cat) setCat(p.cat); if (p.method) setMethod(p.method); if (p.channel) setChannel(p.channel);
      if (p.cat || p.method || p.channel) setApplied({ s, prev: { cat: "", method: startMethod, channel: startChannel } });
    });
    return () => { live = false; };
  }, [startText, startHasCat, startMethod, startChannel, kind]);
  /** Picking a past merchant fills the category/payment method you usually use for it (only fields you have not touched; undoable). */
  const pickMerchant = (o: MerchantOpt) => { if (o.categoryId || o.methodId) apply({ categoryId: o.categoryId, paymentMethodId: o.methodId, confidence: 0.9, source: "history", reason: `from your ${o.count} past payment${o.count === 1 ? "" : "s"} with ${o.merchant}` } as Suggestion, { cat, method, channel }); };
  const undo = () => { if (!applied) return; setCat(applied.prev.cat); setMethod(applied.prev.method); setChannel(applied.prev.channel); setApplied(null); };
  const catName = lookups.categories.find((c) => c.id === applied?.s.categoryId)?.name; const methodName = lookups.methods.find((m) => m.id === applied?.s.paymentMethodId)?.label;
  return (
    <form action={action} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
      // Validate every field before anything is sent; "Save as draft" only checks what you filled in.
      const draft = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.hasAttribute("formnovalidate") ?? false; const fd = new FormData(e.currentTarget); const found: Record<string, string> = {};
      for (const k of Object.keys(rules)) { const m = rules[k](String(fd.get(k) ?? ""), draft); if (m) found[k] = m; }
      setErrs(found); if (Object.keys(found).length) { e.preventDefault(); const form = e.currentTarget; setTimeout(() => (form.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0); }
    }}>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {initial?.draftId && <input type="hidden" name="draftId" value={initial.draftId} />}
      {initial?.externalRef && <input type="hidden" name="externalRef" value={initial.externalRef} />}
      {(state?.error || dState?.error) && <div className="sm:col-span-2"><ErrorNote>{state?.error ?? dState?.error}</ErrorNote></div>}
      {applied && <div role="status" className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm sm:col-span-2">
        <Sparkles size={16} className="shrink-0 text-brand" aria-hidden /><span className="font-medium">Auto-filled</span>
        <span className="text-muted">{[catName && `Category: ${catName}`, methodName && `Payment: ${methodName}`, applied.s.channel && !methodName && `Channel: ${applied.s.channel}`].filter(Boolean).join(" · ")}</span>
        <span className={applied.s.confidence >= 0.85 ? "rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good" : "rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn"}>{Math.round(applied.s.confidence * 100)}% sure</span>
        <span className="text-xs text-muted">{applied.s.reason}</span>
        <button type="button" onClick={undo} className="ml-auto text-xs font-medium text-brand underline">Undo</button>
      </div>}
      {fixedType ? <input type="hidden" name="type" value={fixedType} /> :
        <Field label="Type"><Dropdown name="type" value={type} onChange={setType} options={TYPE_OPTS} ariaLabel="Type" /></Field>}
      <Field label="Amount (₹)" auto={a("amount")} error={err("amount")}><NumInput name="amount" placeholder="0.00" defaultValue={initial?.amount} className={a("amount") ? autoCls : undefined} aria-invalid={!!err("amount")} onBlur={(e) => check("amount", e.target.value)} onChange={() => clear("amount")} /></Field>
      <Field label={type === "income" ? "Payer" : "Merchant / recipient"} auto={a("merchant")} error={err("merchant")}><MerchantField name="merchant" defaultValue={initial?.merchant} onText={(v) => { onText(v); clear("merchant"); }} onBlurValue={(v) => check("merchant", v)} invalid={!!err("merchant")} onPick={(o) => { clear("merchant"); pickMerchant(o); }} className={cn(inputCls, a("merchant") && autoCls)} placeholder={type === "income" ? "Who paid you?" : "Who did you pay?"}
          options={merchants.map((m) => ({ ...m, category: lookups.categories.find((c) => c.id === m.categoryId)?.name }))} /></Field>
      <Field label="Date & time" auto={a("date", "time")} error={err("occurredAt")}><Input name="occurredAt" type="datetime-local" defaultValue={initial?.occurredAt ?? nowLocal()} className={a("date", "time") ? autoCls : undefined} aria-invalid={!!err("occurredAt")} onBlur={(e) => check("occurredAt", e.target.value)} onChange={() => clear("occurredAt")} /></Field>
      <Field label={type === "income" ? "Source category" : "Category"} auto={a("category") && cat === initial?.categoryId}><Dropdown name="categoryId" value={cat} onChange={(v) => { touched.current.cat = true; setCat(v); }} ariaLabel="Category" searchable placeholder="Uncategorised" auto={a("category")}
        options={[{ value: "", label: "Uncategorised", sub: "No category yet", icon: Tag, hue: 230 }, ...cats.map((c) => ({ value: c.id, label: c.name, ...categoryVisual(c.name) }))]} /></Field>
      <Field label="Payment method" auto={a("method") && method === initial?.paymentMethodId}><Dropdown name="paymentMethodId" value={method} onChange={(v) => { touched.current.method = true; setMethod(v); }} ariaLabel="Payment method" searchable placeholder="Not specified" auto={a("method")}
        options={[{ value: "", label: "Not specified", icon: Tag, hue: 230 }, ...methods.map((m) => ({ value: m.id, label: m.label, group: m.channel === "online" ? "Online" : "Offline", ...methodVisual(m.code) }))]} /></Field>
      <Field label="Online / offline" hint="Defaults to the payment method's type if left blank." auto={a("channel") && !!channel}><Dropdown name="channel" value={channel} onChange={(v) => { touched.current.channel = true; setChannel(v); }} options={CHANNEL_OPTS} ariaLabel="Online or offline" auto={a("channel")} /></Field>
      {type === "refund" && <Field label="Refund for expense"><Dropdown name="refundOfId" value={refundOf} onChange={setRefundOf} ariaLabel="Refund for expense" searchable placeholder="Choose the expense…" options={expenses.map((e) => ({ value: e.id, label: e.label, icon: RotateCcw, hue: 200 }))} /></Field>}
      {type === "adjustment" && <Field label="Direction"><Dropdown name="direction" value={direction} onChange={setDirection} ariaLabel="Direction" options={DIRECTION_OPTS} /></Field>}
      <Field label="Tags" hint="Comma separated, e.g. rent, work" auto={a("tags")} error={err("tags")}><Input name="tags" defaultValue={initial?.tags} className={a("tags") ? autoCls : undefined} aria-invalid={!!err("tags")} onBlur={(e) => check("tags", e.target.value)} onChange={() => clear("tags")} /></Field>
      {nameVisible ? <Field label="Name (optional)" hint="Leave it blank to use the merchant." auto={a("name")} error={err("name")}><Input name="name" maxLength={200} defaultValue={nameIsLabel ? initial?.name : ""} className={a("name") ? autoCls : undefined} aria-invalid={!!err("name")} onBlur={(e) => check("name", e.target.value)} onChange={(e) => { onText(e.target.value); clear("name"); }} placeholder={type === "income" ? "e.g. October salary" : type === "adjustment" ? "e.g. Cash balance correction" : "e.g. Lunch with team"} /></Field>
        : <div className="grid content-start gap-1.5 text-sm"><span className="min-h-[22px] font-medium">Name</span><button type="button" onClick={() => setShowName(true)} className="flex h-10 items-center justify-start rounded-lg border border-dashed border-line px-3 text-sm text-muted transition hover:border-brand hover:text-brand">+ Add a label (optional)</button><span className="text-xs text-muted">Leave it out and the merchant is used.</span></div>}
      <div><Field label="Description" auto={a("description")} error={err("description")}><Textarea name="description" rows={4} maxLength={1000} defaultValue={initial?.description} className={a("description") ? autoCls : undefined} aria-invalid={!!err("description")} onBlur={(e) => check("description", e.target.value)} onChange={() => clear("description")} /></Field></div>
      <div><Field label="Notes" auto={a("notes")} error={err("notes")}><Textarea name="notes" rows={4} maxLength={2000} defaultValue={initial?.notes} className={a("notes") ? autoCls : undefined} aria-invalid={!!err("notes")} onBlur={(e) => check("notes", e.target.value)} onChange={() => clear("notes")} /></Field></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button disabled={pending || dPending}>{pending ? "Saving…" : initial?.id ? "Update" : "Save"}</Button>
        {!initial?.id && (fixedType === "expense" || fixedType === "income") && <Button type="submit" variant="outline" formAction={dAction} formNoValidate disabled={pending || dPending}>{dPending ? "Saving draft…" : "Save as draft"}</Button>}
        {!initial?.id && <span className="text-xs text-muted">A draft isn&apos;t counted anywhere until you finish and save it. Its date is shown on your Calendar.</span>}</div>
    </form>
  );
}
