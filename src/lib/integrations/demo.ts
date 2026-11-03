import type { RawRow } from "../imports/parse";

/** A clearly fake bank for trying the Link-a-bank flow without a real Account Aggregator. Nothing here is real customer data. */
export const DEMO_BANK = { name: "Demo Bank", masked: "XXXX4321", type: "SAVINGS", balanceMinor: 42_50_000 } as const; // ₹42,500

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

/**
 * Sample statement rows in the same shape the real Account Aggregator import produces (Date, Description, Debit, Credit, Reference, Account),
 * counted back from `today`, so they always land in the last ~6 weeks. References are fixed per day+line, so loading twice flags duplicates.
 */
export function sampleBankRows(today = new Date()): RawRow[] {
  // [days ago, narration, debit, credit]
  const lines: [number, string, number, number][] = [
    [1, "UPI/swiggy@icici/Swiggy order", 412, 0], [2, "UPI/blinkit@hdfcbank/Blinkit groceries", 689, 0], [2, "UPI/uber@axisbank/Uber ride", 238, 0],
    [4, "NEFT/ACME TECH PVT LTD/SALARY", 0, 72000], [5, "UPI/bescom@sbi/BESCOM electricity bill", 1840, 0], [6, "UPI/zepto@yesbank/Zepto order", 356, 0],
    [7, "POS/Reliance Smart Store", 1523, 0], [9, "UPI/netflix@icici/Netflix subscription", 649, 0], [10, "UPI/swiggy@icici/Swiggy order", 528, 0],
    [12, "UPI/friend@okaxis/Dinner split", 0, 850], [13, "ATM/CASH WITHDRAWAL", 3000, 0], [15, "UPI/amazonpay@apl/Amazon shopping", 2199, 0],
    [16, "UPI/ola@icici/Ola cab", 274, 0], [18, "UPI/airtel@hdfcbank/Airtel mobile recharge", 399, 0], [20, "UPI/apollo@sbi/Apollo pharmacy", 742, 0],
    [22, "UPI/swiggy@icici/Swiggy order", 463, 0], [24, "NEFT/ACME TECH PVT LTD/SALARY", 0, 72000], [25, "UPI/rent@okicici/House rent", 18000, 0],
    [27, "UPI/spotify@axisbank/Spotify", 119, 0], [29, "POS/Big Bazaar groceries", 2310, 0], [31, "UPI/irctc@sbi/IRCTC train ticket", 1065, 0],
    [34, "UPI/blinkit@hdfcbank/Blinkit groceries", 574, 0], [37, "INT.PD/Savings interest", 0, 312], [40, "UPI/flipkart@axisbank/Flipkart order", 1499, 0],
  ];
  return lines.map(([ago, narration, debit, credit], i) => {
    const date = ymd(addDays(today, -ago));
    return { Date: date, Description: narration, Debit: debit ? debit.toFixed(2) : "", Credit: credit ? credit.toFixed(2) : "", Reference: `${DEMO_BANK.masked}-DEMO-${date.replace(/-/g, "")}-${i + 1}`, Account: DEMO_BANK.masked };
  });
}
