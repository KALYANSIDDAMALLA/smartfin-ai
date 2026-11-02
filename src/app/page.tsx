import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { DashboardShowcase } from "@/components/dashboard-showcase";
import { HomeHighlights } from "@/components/home-highlights";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRight, ArrowUp, BarChart3, Check, FileUp, GraduationCap, Home as HomeIcon, LineChart, Lock, Mail, Minus, Phone, PiggyBank, Repeat, ShieldCheck, Target, Users, Wallet } from "lucide-react";

/** Founder details shown in the footer; they come from settings (NEXT_PUBLIC_*), not from the code. Anything left empty is simply not shown. */
const clean = (v: string | undefined) => (v ?? "").trim();
const FOUNDER = { name: clean(process.env.NEXT_PUBLIC_BUSINESS_NAME), role: clean(process.env.NEXT_PUBLIC_CONTACT_ROLE), email: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL), phone: clean(process.env.NEXT_PUBLIC_CONTACT_PHONE) };


const FEATURES = [
  { icon: Wallet, title: "One clear record", desc: "Income, expenses, refunds and transfers recorded correctly — transfers never inflate your spending, refunds reduce it." },
  { icon: FileUp, title: "Import statements", desc: "Bring in CSV, Excel or PDF statements. Preview, fix and confirm every row; duplicates are flagged for you." },
  { icon: PiggyBank, title: "Budgets that warn once", desc: "Daily to yearly budgets by category or online/offline, with alerts at 50, 75, 90 and 100% — never repeated." },
  { icon: Target, title: "Goals & savings planner", desc: "Track emergency funds, a house or travel. The planner shows what is realistically affordable, and warns when it isn't." },
  { icon: Repeat, title: "Recurring bills", desc: "Rent, EMIs and subscriptions as reminders. Nothing is recorded as paid until you confirm it." },
  { icon: BarChart3, title: "Analytics & exports", desc: "Daily, weekly, monthly and yearly views, UPI vs card vs cash, and CSV, Excel or PDF reports." },
];
const STEPS = [
  { n: "1", title: "Add your money activity", desc: "Enter transactions in seconds or import a bank statement." },
  { n: "2", title: "See where it goes", desc: "Dashboards and budgets update from your own records — no guesswork." },
  { n: "3", title: "Plan and improve", desc: "Set goals, follow the savings plan and review AI-assisted insights." },
];
const PROBLEMS = [
  ["Money leaks quietly", "UPI taps, subscriptions and small cash spends add up. Without one place to see them, month-end feels like a surprise."],
  ["Spreadsheets break", "Formulas drift, refunds get double counted and card bill payments show up as spending twice."],
  ["Goals stay vague", "“Save more” isn't a plan. You need a target, a date and a number you can actually afford."],
];
const COMPARE = [
  ["Refunds reduce what you spent", true, false],
  ["Card bill payments not counted twice", true, false],
  ["Budget alerts, once per threshold", true, false],
  ["Duplicate detection on imports", true, false],
  ["Realistic savings plan with warnings", true, false],
  ["Works on phone and desktop", true, true],
];
const AUDIENCES = [
  { icon: GraduationCap, title: "Students & early earners", desc: "Stay inside a monthly allowance, see where UPI money goes and start your first emergency fund." },
  { icon: Users, title: "Salaried professionals", desc: "Track salary against rent, EMIs and subscriptions, then automate the habit of saving what is left." },
  { icon: HomeIcon, title: "Families & households", desc: "Plan for big goals like a home, a vehicle or education with dates and monthly targets that add up." },
];
const PRINCIPLES = [
  ["Accuracy over flash", "Every amount is stored in paise as an integer, so totals match your records to the last rupee."],
  ["Honest about limits", "If a feature needs a bank or provider approval, we say so — we never fake a connection."],
  ["You stay in control", "Imports need your confirmation, recurring items are reminders, and your data is yours to export or delete."],
];
const FAQ = [
  ["Does SmartFin move or access my money?", "No. It is a tracker and analysis tool — not a bank, wallet or payment service. It never initiates payments and never asks for bank passwords."],
  ["Does it connect to UPI apps or my bank automatically?", "Not today. Automatic bank connections need provider approval and your explicit consent, and aren't live. You can add transactions manually or import statements."],
  ["How does the AI work?", "Totals and comparisons are calculated by the app itself. AI only explains those verified numbers. If AI is unavailable you still get a built-in summary."],
  ["Can I export or delete my data?", "Yes. Download everything or permanently delete your account from Settings at any time."],
];

export default async function Home() {
  const { data } = await (await createClient()).auth.getClaims();
  if (data?.claims) redirect("/dashboard");
  return (
    <div id="top" className="min-h-screen">
      {/* Full-page picture behind everything (public/home-bg.svg, and home-bg-dark.svg in dark mode). Home page only. */}
      <div aria-hidden className="home-art" />
      {/* Rupee coins: placed from the middle of the empty gap beside the content (see .home-coins in globals.css); only shown when the gap is wide enough for them. */}
      <div aria-hidden className="home-coins"><i className="coin coin-l1" /><i className="coin coin-l2" /><i className="coin coin-r1" /><i className="coin coin-r2" /></div>
      <header className="glass sticky top-3 z-20 mx-3 mt-3 rounded-2xl sm:mx-auto sm:max-w-6xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="SmartFin AI home" className="text-brand"><Logo /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-3 text-sm text-muted md:flex lg:gap-6"><a href="#showcase" className="hover:text-fg">See it</a><a href="#features" className="hover:text-fg">Features</a><a href="#how" className="hover:text-fg">How it works</a><a href="#ai" className="hover:text-fg">AI</a><a href="#faq" className="hover:text-fg">FAQ</a><Link href="/contact" className="whitespace-nowrap hover:text-fg">Contact us</Link></nav>
          <div className="flex items-center gap-2 text-sm"><span className="mr-2 sm:mr-5"><ThemeToggle /></span><Link href="/login" className="btn-shine rounded-xl border border-brand/45 bg-brand/10 px-4 py-2 font-semibold text-brand shadow-sm transition hover:border-brand hover:bg-brand/20">Log in</Link><Link href="/register" className="btn-shine glow rounded-xl bg-linear-to-b from-brand to-brand/85 px-4 py-2 font-semibold text-brandfg shadow-lg shadow-brand/40 ring-1 ring-white/30 transition hover:brightness-110">Sign up</Link></div>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-h" className="mx-3 mt-4 sm:mx-auto sm:max-w-6xl">
          <div className="relative isolate overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(135deg,rgba(23,20,64,.88),rgba(46,40,150,.78)_55%,rgba(67,56,202,.7))] px-5 py-10 text-white shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,.3)] backdrop-blur-xl backdrop-saturate-150 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-white/10" />
            <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-[26rem] w-[26rem] rounded-full bg-black/15" />
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Built for India · ₹ INR · IST</p>
                <h1 id="hero-h" className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">Know where your money goes. <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">Save with a plan.</span></h1>
                <p className="mt-5 max-w-lg text-lg text-white/80">SmartFin AI tracks your income and spending, keeps you inside your budgets, and turns your own numbers into clear, AI-assisted insights.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/register" className="btn-shine inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-indigo-900 shadow-xl shadow-white/20 ring-2 ring-white/50 transition hover:bg-indigo-50">Create free account <ArrowRight size={16} aria-hidden /></Link>
                  <Link href="/login" className="btn-shine inline-flex h-12 items-center justify-center rounded-xl border-2 border-white/70 bg-white/15 px-6 text-sm font-semibold shadow-lg shadow-black/20 backdrop-blur transition hover:border-white hover:bg-white/25">Log in</Link>
                </div>
                <ul className="mt-8 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
                  {["Email-verified accounts", "Your data stays yours", "Export or delete anytime", "No bank passwords, ever"].map((t) => <li key={t} className="flex items-center gap-2"><Check size={16} className="text-emerald-300" aria-hidden />{t}</li>)}
                </ul>
              </div>
              <DashboardShowcase />
            </div>
          </div>
          <ul aria-label="Highlights" className="glass mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line/60 p-0 text-center text-sm sm:grid-cols-4">
            {[["Paise-exact", "totals match your records"], ["CSV · Excel · PDF", "statement imports"], ["Row-level security", "your records stay yours"], ["Export or delete", "any time, from Settings"]].map(([t, d]) => (
              <li key={t} className="bg-surface/80 px-3 py-4 backdrop-blur"><p className="font-semibold text-brand">{t}</p><p className="mt-0.5 text-xs text-muted">{d}</p></li>))}
          </ul>
        </section>

        <HomeHighlights />

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-center text-sm font-medium uppercase tracking-wide text-brand">Why SmartFin AI</p>
          <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-semibold tracking-tight">Most people don&apos;t overspend on purpose — they just can&apos;t see it</h2>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">{PROBLEMS.map(([t, d]) => <li key={t} className="glass rounded-2xl p-6"><h3 className="font-medium">{t}</h3><p className="mt-2 text-sm text-muted">{d}</p></li>)}</ul>
          <p className="mx-auto mt-8 max-w-2xl text-center text-muted">SmartFin AI gives you one trustworthy record, clear budgets and a plan — so you spend with awareness and save with intent.</p>
        </section>

        <section id="features" className="scroll-mt-14 border-y border-line/60 bg-surface/40 py-16 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Everything you need to manage money</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Accurate accounting at the core, with the tools to plan around it.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: I, title, desc }) => (
                <li key={title} className="glass rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-brand/40"><span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><I size={20} aria-hidden /></span>
                  <h3 className="mt-4 font-medium">{title}</h3><p className="mt-1 text-sm text-muted">{desc}</p></li>))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Made for real-life money</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Whether you are budgeting a first salary or planning for a home, the same clear record works for you.</p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">{AUDIENCES.map(({ icon: I, title, desc }) => <li key={title} className="glass rounded-2xl p-6"><I size={22} className="text-brand" aria-hidden /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-1 text-sm text-muted">{desc}</p></li>)}</ul>
        </section>

        <section id="how" className="scroll-mt-14 mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => <li key={s.n} className="relative glass rounded-2xl p-6"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brandfg">{s.n}</span><h3 className="mt-4 font-medium">{s.title}</h3><p className="mt-1 text-sm text-muted">{s.desc}</p></li>)}
          </ol>
        </section>

        <section id="ai" className="scroll-mt-14 border-y border-line/60 bg-surface/40 py-16 backdrop-blur-sm">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><LineChart size={20} aria-hidden /></span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">AI that explains — your numbers do the math</h2>
              <p className="mt-3 text-muted">Totals, percentages and comparisons are calculated by the app from your records. AI then summarises patterns, flags unusual items worth reviewing, and answers questions about your own records.</p>
              <ul className="mt-5 grid gap-2 text-sm">{["“How much did I spend on groceries this year?”", "“Which category increased the most?”", "“Can I reach my goal by the target date?”"].map((q) => <li key={q} className="rounded-lg border border-line bg-bg/50 px-3 py-2 text-muted">{q}</li>)}</ul>
            </div>
            <div className="glass rounded-2xl p-6">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><ShieldCheck size={20} aria-hidden /></span>
              <h3 className="mt-4 text-xl font-semibold">Privacy and safety first</h3>
              <ul className="mt-3 grid gap-3 text-sm text-muted">
                <li className="flex gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />Database-level isolation: no one else can read your records.</li>
                <li className="flex gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />AI receives only the minimum aggregated data — never passwords or your email.</li>
                <li className="flex gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />Unusual spending is flagged for review, never labelled as fraud.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Why not just a spreadsheet?</h2>
          <div className="mt-8 glass overflow-x-auto rounded-2xl">
            <table className="w-full text-left text-sm"><caption className="sr-only">SmartFin AI compared with a typical spreadsheet</caption>
              <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th scope="col" className="px-4 py-3">Capability</th><th scope="col" className="px-4 py-3 text-center text-brand">SmartFin AI</th><th scope="col" className="px-4 py-3 text-center">Typical spreadsheet</th></tr></thead>
              <tbody>{COMPARE.map(([l, a, b]) => <tr key={l as string} className="border-b border-line/60 last:border-0"><th scope="row" className="px-4 py-3 font-normal">{l}</th>
                {[a, b].map((v, i) => <td key={i} className="px-4 py-3 text-center">{v ? <Check size={18} className="mx-auto text-good" aria-label="Yes" /> : <Minus size={18} className="mx-auto text-muted" aria-label="Not by default" />}</td>)}</tr>)}</tbody></table></div>
          <p className="mt-2 text-xs text-muted">Comparison reflects a typical hand-built spreadsheet, not any specific product.</p>
        </section>

        <section className="border-y border-line/60 bg-surface/40 py-16 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 sm:px-6"><h2 className="text-center text-3xl font-semibold tracking-tight">What we stand for</h2>
            <ul className="mt-10 grid gap-6 md:grid-cols-3">{PRINCIPLES.map(([t, d]) => <li key={t}><h3 className="flex items-center gap-2 font-medium"><Check size={18} className="text-brand" aria-hidden />{t}</h3><p className="mt-2 text-sm text-muted">{d}</p></li>)}</ul></div>
        </section>

        <section id="faq" className="scroll-mt-14 mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Questions, answered</h2>
          <div className="mt-8 grid gap-3">{FAQ.map(([q, a]) => (
            <details key={q} className="group glass rounded-2xl p-4"><summary className="cursor-pointer list-none font-medium after:float-right after:text-muted after:content-['+'] group-open:after:content-['–']">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>))}</div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl bg-[linear-gradient(135deg,#1e1b4b,#3730a3_55%,#4f46e5)] px-6 py-12 text-center text-white shadow-xl shadow-indigo-900/20">
            <h2 className="text-3xl font-semibold tracking-tight">Start with a clearer view of your money</h2>
            <p className="mx-auto mt-2 max-w-xl opacity-90">Create your account in under a minute. Verify your email and you&apos;re in.</p>
            <Link href="/register" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-6 text-sm font-medium text-indigo-900 transition hover:bg-indigo-50">Create free account <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60 bg-surface/50 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2"><p className="text-brand"><Logo /></p>
            <p className="mt-3 max-w-sm text-sm text-muted">Personal finance tracking, budgets, goals and AI-assisted insights for people in India.</p>
            {(FOUNDER.name || FOUNDER.email || FOUNDER.phone) && <div className="mt-5 max-w-sm border-t border-line/60 pt-4 text-sm">
              {FOUNDER.name && <p className="font-semibold text-fg">{FOUNDER.name}</p>}
              {FOUNDER.role && <p className="text-muted">{FOUNDER.role}</p>}
              <ul className="mt-2.5 grid gap-1 text-muted">
                {FOUNDER.email && <li><a href={`mailto:${FOUNDER.email}`} className="inline-flex min-h-8 items-center gap-2 break-all transition hover:text-brand"><Mail size={15} className="shrink-0 text-brand" aria-hidden />{FOUNDER.email}</a></li>}
                {FOUNDER.phone && <li><a href={`tel:${FOUNDER.phone.replace(/[^+\d]/g, "")}`} className="inline-flex min-h-8 items-center gap-2 transition hover:text-brand"><Phone size={15} className="shrink-0 text-brand" aria-hidden />{FOUNDER.phone}</a></li>}
              </ul></div>}</div>
          <nav aria-label="Product"><h2 className="text-sm font-medium">Product</h2><ul className="mt-3 grid gap-2 text-sm text-muted">
            <li><a href="#features" className="hover:text-fg">Features</a></li><li><a href="#how" className="hover:text-fg">How it works</a></li><li><a href="#ai" className="hover:text-fg">AI &amp; privacy</a></li><li><a href="#faq" className="hover:text-fg">FAQ</a></li><li><Link href="/api-docs" className="hover:text-fg">API docs</Link></li></ul></nav>
          <nav aria-label="Account and legal"><h2 className="text-sm font-medium">Account &amp; legal</h2><ul className="mt-3 grid gap-2 text-sm text-muted">
            <li><Link href="/register" className="hover:text-fg">Create account</Link></li><li><Link href="/login" className="hover:text-fg">Log in</Link></li><li><Link href="/privacy" className="hover:text-fg">Privacy policy</Link></li><li><Link href="/terms" className="hover:text-fg">Terms of use</Link></li><li><Link href="/contact" className="hover:text-fg">Contact us</Link></li></ul></nav>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted sm:px-6 md:flex-row md:items-start md:justify-between">
            <p className="max-w-3xl">SmartFin AI tracks and analyses finances. It is not a bank, wallet or payment service and never moves money. Insights, forecasts and plans are estimates, not financial, tax or investment advice.</p>
            <a href="#top" className="tap inline-flex shrink-0 items-center gap-1 hover:text-fg"><ArrowUp size={14} aria-hidden />Back to top</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
