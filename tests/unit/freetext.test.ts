import { describe, it, expect } from "vitest";
import { parseFreeText, findTime } from "@/lib/imports/freetext";

const today = "2026-11-01"; // a Sunday
describe("free-text reader", () => {
  it("reads a typical note", () => {
    const r = parseFreeText("paid 250 to Ravi for lunch yesterday via GPay", today);
    expect(r).toMatchObject({ ok: true, type: "expense", amount: "250.00", date: "2026-10-31", merchant: "Ravi", name: "Lunch", methodCode: "gpay", channel: "online" });
  });
  it("reads income and short amounts (k / lakh)", () => {
    expect(parseFreeText("got 9k from client for logo design on 5th Nov", today)).toMatchObject({ type: "income", amount: "9000.00", date: "2026-11-05".replace("2026", "2025"), merchant: "Client", name: "Logo design" });
    expect(parseFreeText("received ₹1.5 lakh salary credited 01-11-2026", today)).toMatchObject({ type: "income", amount: "150000.00", date: "2026-11-01" });
  });
  it("handles weekdays, days ago, time and cash", () => {
    expect(parseFreeText("spent Rs 1,250.50 at Big Bazaar last friday 6:45 pm cash", today)).toMatchObject({ amount: "1250.50", date: "2026-10-30", time: "18:45", methodCode: "cash", channel: "offline", merchant: "Big Bazaar" });
    expect(parseFreeText("bought shoes for 2,999 3 days ago", today)).toMatchObject({ amount: "2999.00", date: "2026-10-29" });
  });
  it("never guesses between several numbers, and ignores dates/refs as amounts", () => {
    expect(parseFreeText("bought 2 shirts and 3 pants", today).ok).toBe(false);
    expect(parseFreeText("paid ₹450 on 01-11-26 ref 312345678901", today)).toMatchObject({ ok: true, amount: "450.00", date: "2026-11-01", ref: "312345678901" });
    expect(parseFreeText("hello there how are you today", today).ok).toBe(false);
    expect(parseFreeText("Your OTP is 482913, do not share", today).ok).toBe(false);
  });
  it("uses the page as a hint when no verb says which way the money went, and adds tags", () => {
    expect(parseFreeText("lunch 250", today, "expense")).toMatchObject({ ok: true, amount: "250.00", type: "expense", confidence: "low" });
    expect(parseFreeText("house rent 22000 via net banking", today)).toMatchObject({ amount: "22000.00", methodCode: "net_banking", tags: ["rent"] });
  });
  it("finds times without mistaking amounts for times", () => {
    expect(findTime("at 14:32:10 today")).toBe("14:32"); expect(findTime("2.30pm")).toBe("14:30"); expect(findTime("12 am")).toBe("00:00"); expect(findTime("paid 2.30 rupees")).toBeUndefined();
  });
  it("names an entry by its purpose and never uses an account number as the payee", () => {
    expect(parseFreeText("house rent 22000 to Mr Patil via net banking", today)).toMatchObject({ merchant: "Mr Patil", name: "House rent" });
    expect(parseFreeText("lunch 250", today)).toMatchObject({ name: "Lunch" });
    expect(parseFreeText("Rs.1,899.00 debited from A/c XX1234 on 29-10-26 to VPA swiggy@icici", today).merchant).not.toMatch(/A\/c|XX1234/);
  });
});

import { parseBankMessage } from "@/lib/imports/sms";
describe("real bank messages: disclaimers are never the payee", () => {
  const kotak = "Dear customer,\n\nYou have successfully made a UPI payment of INR 50.00 towards EDUNURI VARSHITHA through the Kotak 811 App. UPI Ref: 629312345678 on 23-10-2026. If this transaction wasn't done by you, call 1800 4100 to report.";
  it("takes the payee after 'towards', not the helpline sentence", () => {
    expect(parseBankMessage(kotak)).toMatchObject({ ok: true, type: "expense", amount: "50.00", date: "2026-10-23", merchant: "Edunuri Varshitha", methodCode: "upi", ref: "629312345678" });
    const f = parseFreeText(kotak, "2026-11-01"); expect(f).toMatchObject({ ok: true, amount: "50.00", merchant: "Edunuri Varshitha", date: "2026-10-23" });
  });
  it("handles other common phrasings", () => {
    expect(parseBankMessage("Rs 120.00 paid to ZOMATO via Paytm on 01-11-2026. For any queries call 1800 123 4567 to report.").merchant).toBe("Zomato");
    expect(parseBankMessage("Sent Rs.500 to Ravi Kumar via UPI on 01-11-26. Not you? Call 1800 111 222.").merchant).toBe("Ravi Kumar");
    expect(parseBankMessage("INR 2,000.00 transferred in favour of ACME TRADERS through NEFT on 31/10/2026").merchant).toBe("Acme Traders");
  });
  it("two-digit decimals are amounts, not clock times", () => {
    expect(parseFreeText("paid ₹50.00 to Ravi", "2026-11-01")).toMatchObject({ amount: "50.00", merchant: "Ravi" });
    expect(parseFreeText("spent 12.50 on tea at 2.30pm", "2026-11-01")).toMatchObject({ amount: "12.50", time: "14:30" });
  });
});
