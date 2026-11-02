import { useId } from "react";
import { cn } from "./ui";

/** SmartFin AI mark: rounded tile with rising bars and a spark. Colours come from theme tokens so it works in light and dark. */
export function LogoMark({ size = 28, className, tile, ink = "#ffffff", accent = "#fbbf24" }: { size?: number; className?: string; tile?: string; ink?: string; accent?: string }) {
  const gid = `sf-grad-${useId().replace(/:/g, "")}`; // unique per instance: with one shared id, the first copy (possibly inside a hidden panel) wins and the others render blank
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="SmartFin AI logo" className={cn("shrink-0", className)}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f46e5" /><stop offset="1" stopColor="#1e1b4b" /></linearGradient></defs>
      <rect width="32" height="32" rx="8" fill={tile ?? `url(#${gid})`} />
      <rect x="7" y="17" width="4.5" height="8" rx="1.5" fill={ink} opacity=".6" />
      <rect x="13.75" y="12.5" width="4.5" height="12.5" rx="1.5" fill={ink} opacity=".8" />
      <rect x="20.5" y="8" width="4.5" height="17" rx="1.5" fill={ink} />
      <path d="M8 11.5l3.2-3.2 2.6 2.1 4.4-5" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ size = 28, className, textClassName, tile, ink, accent }: { size?: number; className?: string; textClassName?: string; tile?: string; ink?: string; accent?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} tile={tile} ink={ink} accent={accent} />
      <span className={cn("text-lg font-semibold tracking-tight", textClassName)}>SmartFin AI</span>
    </span>
  );
}
