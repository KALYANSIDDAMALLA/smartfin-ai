import Link from "next/link";
export const metadata = { title: "Terms · SmartFin AI" };
export default function Terms() {
  return (<main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6"><Link href="/" className="text-brand">← SmartFin AI</Link>
    <h1 className="mt-4 text-2xl font-semibold">Terms of use</h1><p className="mt-1 text-muted">Draft for launch review — have it reviewed by legal counsel before publishing.</p>
    <h2 className="mt-6 font-medium">Not a financial institution</h2><p>SmartFin AI records and analyses transactions you enter or import. It is not a bank, wallet or payment service, and it never initiates or moves money.</p>
    <h2 className="mt-6 font-medium">Not financial advice</h2><p>Insights, forecasts and planner outputs are estimates based on the data you provide and are not investment, tax, credit or legal advice. “Unusual activity” flags are prompts to review, not findings of fraud.</p>
    <h2 className="mt-6 font-medium">Your responsibilities</h2><p>Keep your login secure, check imported data before confirming, and don’t upload content you aren’t entitled to share.</p></main>);
}
