"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const PALETTE = ["#4338ca", "#059669", "#d97706", "#0ea5e9", "#db2777", "#7c3aed", "#65a30d", "#dc2626", "#475569", "#ca8a04"];

const inr = (v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const axis = { stroke: "var(--muted)", fontSize: 12 };
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)" } };
type Pt = Record<string, string | number>;

/** All chart values are RUPEES (display only), converted from backend paise by the caller. */
export function BarsChart({ data, keys, stacked }: { data: Pt[]; keys: { key: string; label: string; color?: string }[]; stacked?: boolean }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  return (
    <div role="img" aria-label="Bar chart" className="h-72 w-full"><ResponsiveContainer>
      <BarChart data={data}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={(v) => inr(v)} width={70} />
        <Tooltip {...tip} formatter={(v) => inr(Number(v))} /><Legend />
        {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color ?? PALETTE[i]} stackId={stacked ? "a" : undefined} radius={[4, 4, 0, 0]} />)}</BarChart>
    </ResponsiveContainer></div>
  );
}
export function LinesChart({ data, keys }: { data: Pt[]; keys: { key: string; label: string; color?: string }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  return (
    <div role="img" aria-label="Line chart" className="h-72 w-full"><ResponsiveContainer>
      <LineChart data={data}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={(v) => inr(v)} width={70} />
        <Tooltip {...tip} formatter={(v) => inr(Number(v))} /><Legend />
        {keys.map((k, i) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? PALETTE[i]} strokeWidth={2} dot={false} />)}</LineChart>
    </ResponsiveContainer></div>
  );
}
export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No spending in this period.</p>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <div role="img" aria-label="Spending breakdown" className="h-56"><ResponsiveContainer><PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
        <Tooltip {...tip} formatter={(v) => inr(Number(v))} /></PieChart></ResponsiveContainer></div>
      <ul className="grid gap-1.5 text-sm">{data.map((d, i) => <li key={d.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span><span className="tabnum text-muted">{inr(d.value)}</span></li>)}</ul>
    </div>
  );
}

/** This period's running spend against the previous period's, by day number. Values are rupees; `current` is null for days that have not happened yet. */
export function CumulativeChart({ data }: { data: { label: string; current: number | null; previous: number | null }[] }) {
  if (data.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough days to chart.</p>;
  return (
    <div role="img" aria-label="Cumulative spending, this period versus the previous period" className="h-64 w-full"><ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs><linearGradient id="cumNow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} /><XAxis dataKey="label" {...axis} interval="equidistantPreserveStart" minTickGap={24} /><YAxis {...axis} tickFormatter={(v) => inr(v)} width={88} />
        <Tooltip {...tip} formatter={(v) => inr(Number(v))} labelFormatter={(l) => `Day ${l}`} /><Legend />
        <Area type="monotone" dataKey="previous" name="Previous period" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} fill="none" dot={false} connectNulls={false} />
        <Area type="monotone" dataKey="current" name="This period" stroke="#6366f1" strokeWidth={2.5} fill="url(#cumNow)" dot={false} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}
