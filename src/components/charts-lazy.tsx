"use client";
import dynamic from "next/dynamic";

/** Recharts is heavy: load it only when a chart is actually rendered, client-side, with a same-size placeholder. */
const ph = <div className="h-72 w-full animate-pulse rounded-lg bg-surface2" aria-hidden />;
export const BarsChart = dynamic(() => import("./charts").then((m) => m.BarsChart), { ssr: false, loading: () => ph });
export const LinesChart = dynamic(() => import("./charts").then((m) => m.LinesChart), { ssr: false, loading: () => ph });
export const DonutChart = dynamic(() => import("./charts").then((m) => m.DonutChart), { ssr: false, loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-surface2" aria-hidden /> });
export const CumulativeChart = dynamic(() => import("./charts").then((m) => m.CumulativeChart), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-surface2" aria-hidden /> });
