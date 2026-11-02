/** Shown instantly while a page's data loads, so navigation never feels frozen. */
export default function Loading() {
  const bar = "animate-pulse rounded-lg bg-surface2";
  return (
    <div role="status" aria-label="Loading" className="grid gap-6">
      <div className={`${bar} h-8 w-56`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-24`} />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><div className={`${bar} h-72`} /><div className={`${bar} h-72`} /></div>
    </div>
  );
}
