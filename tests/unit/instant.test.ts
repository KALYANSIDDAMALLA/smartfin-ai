import { describe, it, expect } from "vitest";
import { instantRead } from "@/lib/imports/instant";

const ctx = { today: "2026-11-01",
  methods: [{ id: "m-upi", code: "upi", label: "UPI", channel: "online" as const }, { id: "m-gpay", code: "gpay", label: "Google Pay", channel: "online" as const }, { id: "m-cash", code: "cash", label: "Cash", channel: "offline" as const }],
  categories: [{ id: "c-other", name: "Other", kind: "expense" }, { id: "c-food", name: "Food and groceries", kind: "expense" }, { id: "c-rent", name: "Rent", kind: "expense" }, { id: "c-sal", name: "Salary", kind: "income" }] };
describe("instantRead", () => {
  it("fills every field it can from plain English", () => {
    const r = instantRead("paid 250 to Ravi for lunch yesterday 1:15 pm via gpay", "expense", ctx);
    expect(r).toMatchObject({ ok: true, type: "expense", amount: "250.00", date: "2026-10-31", time: "13:15", merchant: "Ravi", name: "Lunch", methodId: "m-gpay", channel: "online", categoryId: "c-food" });
    expect(r.filled).toEqual(expect.arrayContaining(["amount", "date", "time", "name", "merchant", "category", "method", "channel", "notes"]));
  });
  it("reads a bank alert", () => {
    const r = instantRead("Rs.450.00 debited from A/c XX1234 on 01-11-26 to VPA swiggy@icici (UPI Ref No 312345678901)", "expense", ctx);
    expect(r).toMatchObject({ ok: true, amount: "450.00", date: "2026-11-01", merchant: "swiggy", methodId: "m-upi", ref: "312345678901" }); expect(r.noteText).not.toContain("312345678901");
  });
  it("explains itself when it cannot read the text", () => { const r = instantRead("hello there", "expense", ctx); expect(r.ok).toBe(false); expect(r.reason).toBeTruthy(); });
});

describe("bank alert description and tags", () => {
  it("adds a facts-only description and tags", () => {
    const m = { ...ctx, methods: [...ctx.methods] };
    const r = instantRead("Dear customer, You have successfully made a UPI payment of INR 50.00 towards EDUNURI VARSHITHA through the Kotak811 App. Date: 23-Oct-26. If this wasn't you, call 1800 4100 to report.", "expense", m);
    expect(r).toMatchObject({ amount: "50.00", merchant: "Edunuri Varshitha", name: "Edunuri Varshitha", date: "2026-10-23", description: "UPI payment to Edunuri Varshitha via Kotak", tags: "upi, kotak" });
    expect(r.filled).toEqual(expect.arrayContaining(["description", "tags"]));
  });
});

import { looksLikePerson } from "@/lib/finance/suggest";
describe("payments to an individual", () => {
  it("falls back to Other with an explanation, but never for businesses or real matches", () => {
    const kotak = "You have successfully made a UPI payment of INR 50.00 towards EDUNURI VARSHITHA through the Kotak811 App. Date: 23-Oct-26.";
    const r = instantRead(kotak, "expense", ctx); expect(r.categoryId).toBe("c-other"); expect(r.notes.join(" ")).toMatch(/individual/); expect(r.filled).toContain("category");
    expect(instantRead("Rs 450 paid to SWIGGY via upi on 01-11-26", "expense", ctx).categoryId).toBe("c-food"); // a real rule wins
    expect(instantRead("Rs 450 paid to Sharma Medical Store via upi on 01-11-26", "expense", ctx).categoryId).toBeUndefined(); // a business is not a person
    expect(looksLikePerson("Ravi Kumar")).toBe(true); expect(looksLikePerson("Big Bazaar Pvt Ltd")).toBe(false); expect(looksLikePerson("uber@icici")).toBe(false);
  });
});
