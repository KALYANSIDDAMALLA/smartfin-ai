import { Bell, Target } from "lucide-react";
import { AuthPreview } from "./auth-preview";

/** Home-page hero visual: the sample dashboard with two small floating cards (budget alert, goal progress). Decorative, sample data only. */
export function DashboardShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-md pb-16">
      <AuthPreview />
      <div aria-hidden className="float-slow absolute bottom-0 left-0 hidden items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-slate-800 shadow-2xl shadow-black/30 sm:flex" style={{ animationDelay: "-2s" }}>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-600"><Bell size={16} /></span>
        <span className="text-xs leading-tight"><b className="block text-[13px]">Food &amp; dining at 75%</b>Budget alert, sent once</span>
      </div>
      <div aria-hidden className="float-slow absolute bottom-0 right-0 hidden items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-slate-800 shadow-2xl shadow-black/30 lg:flex" style={{ animationDelay: "-4s" }}>
        <span className="relative grid h-9 w-9 place-items-center rounded-full" style={{ background: "conic-gradient(#4f46e5 45%, #e2e8f0 0)" }}><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-indigo-600"><Target size={12} /></span></span>
        <span className="text-xs leading-tight"><b className="block text-[13px]">Emergency fund</b>45% of ₹3,00,000</span>
      </div>
    </div>
  );
}
