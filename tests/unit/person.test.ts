import { describe, expect, it } from "vitest";
import { personFallback, personFromNarration, personSuggestion } from "@/lib/finance/suggest";

const cats = [
  { id: "e-person", name: "Person", kind: "expense" }, { id: "i-person", name: "Person", kind: "income" },
  { id: "e-other", name: "Other", kind: "expense" }, { id: "e-food", name: "Food and groceries", kind: "expense" },
];

describe("payments to people", () => {
  it("finds the person's name in UPI / IMPS / NEFT narrations", () => {
    expect(personFromNarration("UPI/TALLAM LAXMI/562304193419/Payment from PhonePe")).toBe("TALLAM LAXMI");
    expect(personFromNarration("IMPS/123456789012/RAVI KUMAR/rent")).toBe("RAVI KUMAR");
    expect(personFromNarration("UPI-RAVI KUMAR-ravi@okaxis-Dinner")).toBe("RAVI KUMAR");
    expect(personFromNarration("upi/Edunuri Varshitha/100000000001/Sent")).toBe("Edunuri Varshitha");
  });
  it("accepts one-word names on UPI/IMPS lines and names after to / from", () => {
    expect(personFromNarration("UPI/RAVI/100000000001/Sent using Paytm")).toBe("RAVI");
    expect(personFromNarration("IMPS/123456789012/Suresh/gift")).toBe("Suresh");
    expect(personFromNarration("Transfer to RAVI KUMAR on 12/01")).toBe("RAVI KUMAR");
    expect(personFromNarration("Received from Suresh Babu via UPI")).toBe("Suresh Babu");
    expect(personFromNarration("BY TRANSFER FROM ANITA RAO REF 123")).toBe("ANITA RAO");
  });
  it("does not take businesses, brands or generic words for people", () => {
    for (const t of ["UPI/SWIGGY/100000000001/Order", "UPI/PAYTM/1/x", "UPI/SELF/1/x", "UPI/BIG BAZAAR PVT LTD/100000000002/POS", "Payment to Swiggy Foods Pvt Ltd", "Transfer to own account", "Paid to Amazon Pay", "NEFT/RAVI/1/x", "UPI/RELIANCE RETAIL LTD/1/x", "UPI/Apollo Pharmacy/1/x", "UPI/ZEPTO MARKETPLACE SERVICES/1/x", "NEFT/ACME TECH PVT LTD/SALARY/1", "UPI/swiggy@icici/1/x", "UPI/PAYTM 9876/1/x", "POS/Reliance Smart Store", "Salary credited", "ATM CASH WITHDRAWAL", ""])
      expect(personFromNarration(t), t).toBeNull();
  });
  it("suggests the Person category for the right kind", () => {
    expect(personSuggestion("UPI/TALLAM LAXMI/562304193419/Payment from PhonePe", cats, "expense")?.categoryId).toBe("e-person");
    expect(personSuggestion("UPI/TALLAM LAXMI/562304193419/Payment from PhonePe", cats, "income")?.categoryId).toBe("i-person");
    expect(personSuggestion("UPI/SWIGGY/1/x", cats, "expense")).toBeNull();
  });
  it("gives nothing when the Person category does not exist yet", () => expect(personSuggestion("UPI/TALLAM LAXMI/1/x", cats.filter((c) => c.name !== "Person"), "expense")).toBeNull());
  it("the paste fallback now uses Person (and still Other if Person is missing)", () => {
    expect(personFallback(cats, "expense", "Ravi Kumar")?.categoryId).toBe("e-person");
    expect(personFallback(cats.filter((c) => c.name !== "Person"), "expense", "Ravi Kumar")?.categoryId).toBe("e-other");
    expect(personFallback(cats, "expense", "Big Bazaar Pvt Ltd")).toBeNull();
  });
});
