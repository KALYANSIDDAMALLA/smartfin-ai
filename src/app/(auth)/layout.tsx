import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthNav } from "@/components/auth-nav";
import { AuthTabs } from "@/components/auth-tabs";
import { AssistantShowcase } from "@/components/assistant-showcase";
import { BarChart3, Check, Lock, ShieldCheck, Sparkles } from "lucide-react";

const POINTS = [
  [BarChart3, "See every rupee", "Income, spending and budgets in one accurate place."],
  [Sparkles, "AI-assisted insights", "Clear explanations built on numbers the app verifies."],
  [ShieldCheck, "Private by design", "Your records are isolated at the database level."],
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#1e1b4b,#3730a3_55%,#4f46e5)] text-white lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/10" />
        <Link href="/" aria-label="SmartFin AI home" className="relative"><Logo size={34} textClassName="text-xl" /></Link>
        <div className="relative grid max-w-md gap-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">Track every rupee. Plan every goal.</h2>
          <div className="[@media(max-height:690px)]:hidden"><AssistantShowcase compact /></div>
          <ul className="grid gap-4 [@media(max-height:900px)]:hidden">{POINTS.map(([I, t, d]) => (
            <li key={t} className="flex gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15"><I size={20} aria-hidden /></span>
              <div><p className="font-medium">{t}</p><p className="text-sm opacity-85">{d}</p></div></li>))}</ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm opacity-85"><Check size={16} aria-hidden />Email-verified accounts · Export or delete your data anytime</p>
      </aside>

      <main className="flex flex-col px-4 py-4 sm:px-8 lg:overflow-y-auto">
        {/* my-auto centres the form when it fits, and collapses to 0 when it does not, so the top (Back/Home) is never pushed out of reach as `justify-center` would */}
        <div className="mx-auto my-auto w-full max-w-lg">
          <AuthNav />
          <Link href="/" aria-label="SmartFin AI home" className="mb-3 flex justify-center text-brand lg:hidden"><Logo /></Link>
          <div className="glass rounded-2xl p-4 sm:p-5"><AuthTabs />{children}</div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock size={12} aria-hidden />Your data is private to you and protected by row-level security.</p>
          <p className="mt-4 text-center text-xs text-muted [@media(max-height:700px)]:hidden">SmartFin AI tracks and analyses your finances. It is not a bank, wallet or payment service and never moves money.</p>
          <p className="mt-2 text-center text-xs text-muted [@media(max-height:700px)]:hidden"><Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
        </div>
      </main>
    </div>
  );
}
