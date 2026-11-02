import Link from "next/link";
export const metadata = { title: "Privacy policy · SmartFin AI" };
export default function Privacy() {
  return (<main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6"><Link href="/" className="text-brand">← SmartFin AI</Link>
    <h1 className="mt-4 text-2xl font-semibold">Privacy policy</h1><p className="mt-1 text-muted">Draft for launch review — have it reviewed by legal counsel before publishing.</p>
    <h2 className="mt-6 font-medium">What we store</h2><p>Your email, optional display name, preferences, and the financial records, files and goals you add or import. Files are kept in a private bucket.</p>
    <h2 className="mt-6 font-medium">How it is protected</h2><p>Every record is owned by your account and enforced by database row-level security. Uploaded files are accessible only to you.</p>
    <h2 className="mt-6 font-medium">AI processing</h2><p>When you request an analysis or ask the assistant a question, aggregated figures (and, for flagged unusual items only, the merchant name) are sent to our AI provider. We never send passwords, tokens or your email. If you don’t want this, don’t use the AI pages; built-in analysis is the fallback.</p>
    <h2 className="mt-6 font-medium">Your controls</h2><p>Download all your data or permanently delete your account from Settings. Assistant history can be cleared at any time.</p>
    <h2 className="mt-6 font-medium">Payments</h2><p>Payments are handled by Razorpay. Your card, UPI or bank details are entered on Razorpay&apos;s secure page and never reach our servers. We keep only the order and payment IDs, the amount and its status. For account checks we keep a masked UPI ID (for example <code>ra•••@bank</code>) and the name the bank returns, never the full ID or an account number.</p>
    <h2 className="mt-6 font-medium">Bank account links</h2><p>No bank connection is active. If one is added, it will require your explicit consent, which you can revoke.</p></main>);
}
