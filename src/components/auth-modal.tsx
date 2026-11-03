"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Log in as a pop-up over the page you were on (the home page stays visible, lightly blurred). Rendered by app/login/page.tsx on top of the home page, so a
 * hard refresh or a direct link looks the same as a click. Esc, the ✕ button or a click on the blurred area closes it (back to the home page).
 */
export function AuthModal({ children }: { children: React.ReactNode }) {
  const router = useRouter(), box = useRef<HTMLDivElement>(null);
  const close = () => router.replace("/");
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.replace("/"); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [router]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center overflow-y-auto bg-black/20 p-4 backdrop-blur-[3px] sm:place-items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Log in" tabIndex={-1} style={{ outline: "none" }} className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl shadow-black/30 outline-none">
        {/* Coloured header band with the title (like the reference); the form's own heading is hidden so it isn't repeated. */}
        <div className="relative bg-[linear-gradient(135deg,#312e81,#4f46e5)] px-6 pb-6 pt-7 text-center text-white">
          <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white"><X size={20} aria-hidden /></button>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-indigo-100">Log in to your SmartFin AI dashboard</p>
        </div>
        <div className="p-5 sm:p-6 [&_[data-auth-head]]:hidden">{children}</div>
      </div>
    </div>
  );
}
