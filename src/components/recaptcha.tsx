"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

declare global { interface Window { grecaptcha?: { render: (el: HTMLElement, o: Record<string, unknown>) => number; reset: (id?: number) => void; ready: (cb: () => void) => void }; } }

/** Public site key (safe to expose). Empty means reCAPTCHA is not configured and nothing is shown. */
export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
/** Google's public demo site key. With it, Google draws a red "testing purposes only" banner INSIDE its own iframe, which cannot be styled. */
const DEMO_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const SRC = "https://www.google.com/recaptcha/api.js?render=explicit";

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.grecaptcha?.render) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script"); s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => { const wait = () => (window.grecaptcha?.render ? resolve() : setTimeout(wait, 50)); wait(); };
    s.onerror = () => { loading = null; reject(new Error("reCAPTCHA failed to load")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Google reCAPTCHA v2 ("I'm not a robot"). The widget adds a `g-recaptcha-response` field to the surrounding <form>; the server verifies it.
 * Tokens are single-use, so change `resetSignal` (e.g. the last form result) to get a fresh checkbox after a failed attempt.
 */
export function Recaptcha({ resetSignal, error, onSolve }: { resetSignal?: unknown; error?: string; onSolve?: () => void }) {
  const holder = useRef<HTMLDivElement>(null); const [k, setK] = useState(1); // scale that makes Google's fixed 304px widget match the width of the form
  useEffect(() => {
    const el = holder.current; if (!el) return;
    const ro = new ResizeObserver(() => setK(Math.min(1.6, Math.max(0.7, el.clientWidth / 304)))); ro.observe(el); return () => ro.disconnect();
  }, []);
  const box = useRef<HTMLDivElement>(null); const id = useRef<number | null>(null); const { resolvedTheme } = useTheme(); const theme = useRef(resolvedTheme === "dark" ? "dark" : "light"); const solved = useRef(onSolve); useEffect(() => { solved.current = onSolve; });
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return; let live = true;
    void loadScript().then(() => {
      if (!live || !box.current || id.current !== null) return;
      const dark = theme.current === "dark"; const wrap = box.current.parentElement; // colours for the demo-key cover strip (see below)
      wrap?.style.setProperty("--rc-bg", dark ? "#222222" : "#f9f9f9"); wrap?.style.setProperty("--rc-bd", dark ? "#555555" : "#d3d3d3");
      id.current = window.grecaptcha!.render(box.current, { sitekey: RECAPTCHA_SITE_KEY, theme: theme.current, callback: () => solved.current?.() });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => { if (resetSignal !== undefined && id.current !== null) window.grecaptcha?.reset(id.current); }, [resetSignal]);
  if (!RECAPTCHA_SITE_KEY) return null; const demo = RECAPTCHA_SITE_KEY === DEMO_KEY;
  return (
    <div role="group" aria-label="Human verification (reCAPTCHA)" className="grid gap-1">
      <div ref={holder} className="w-full" style={{ height: 78 * k }}>
        <div className="relative origin-top-left" style={{ width: 304, transform: `scale(${k})` }}>
          <div ref={box} className="w-[304px]" />
          {demo && <>
            {/* Demo key only: Google paints a red "testing purposes only" banner inside its iframe. Line 1 runs the full width (top 14px); line 2 is short and on the
                left: covered 25px deep beside the checkbox but only 22px over it (x 12–40), so the checkbox's top edge stays intact. Real keys have no banner and no cover. */}
            {[["left-0 right-[2px] h-[14px] rounded-t-[3px] border-x", ""], ["left-0 h-[25px] w-[13px] rounded-tl-[3px] border-l", ""], ["left-[12px] h-[22px] w-[29px]", ""], ["left-[40px] h-[25px] w-[47px]", ""]].map(([cls], i) => (
              <span key={i} aria-hidden className={`pointer-events-none absolute top-0 border-t ${cls}`} style={{ background: "var(--rc-bg, #f9f9f9)", borderColor: "var(--rc-bd, #d3d3d3)" }} />))}
          </>}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
