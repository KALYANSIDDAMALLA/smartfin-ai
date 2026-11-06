import type { ReactElement } from "react";

/** <option>s for a category picker that lists both kinds: grouped under "Expense categories" / "Income categories", so the same name (e.g. "Other") is not shown twice in a row. */
export function groupedCategoryOptions(cats: { id: string; name: string; kind: string }[]): ReactElement[] {
  const group = (kind: "expense" | "income", label: string) => { const xs = cats.filter((c) => c.kind === kind); return xs.length ? <optgroup key={kind} label={label}>{xs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null; };
  return [group("expense", "Expense categories"), group("income", "Income categories")].filter((x): x is ReactElement => !!x);
}
