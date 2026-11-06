"use client";
import { useState } from "react";
import { Field } from "./ui";
import { Select } from "./select";

type Cat = { id: string; name: string; kind: string };
/**
 * The Type and Category boxes of an import row. The Category box lists only categories of the chosen type (no "Other" twice), and changing the
 * type moves the category to the same-named one of the new type when there is one (e.g. Other → Other), otherwise clears it.
 */
export function TypeCategoryFields({ type, categoryId, categories }: { type: string; categoryId: string; categories: Cat[] }) {
  const [t, setT] = useState(type === "income" ? "income" : "expense"); const [cat, setCat] = useState(categoryId);
  const change = (next: string) => { setT(next); const cur = categories.find((c) => c.id === cat); if (!cur || cur.kind === next) return; setCat(categories.find((c) => c.kind === next && c.name.toLowerCase() === cur.name.toLowerCase())?.id ?? ""); };
  const list = categories.filter((c) => c.kind === t);
  return (<>
    <Field label="Type"><Select name="txType" value={t} onChange={(e) => change(e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
    <Field label="Category"><Select kind="category" name="categoryId" value={list.some((c) => c.id === cat) ? cat : ""} onChange={(e) => setCat(e.target.value)}><option value="">—</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
  </>);
}
