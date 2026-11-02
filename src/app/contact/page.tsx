import Link from "next/link";
export const metadata = { title: "Contact · SmartFin AI" };
/** Real contact details come from environment settings so no personal data is hard-coded in the repo. Razorpay requires these to be real before going live. */
const v = (x: string | undefined) => (x ?? "").trim();
export default function Contact() {
  const name = v(process.env.NEXT_PUBLIC_BUSINESS_NAME), email = v(process.env.NEXT_PUBLIC_CONTACT_EMAIL), phone = v(process.env.NEXT_PUBLIC_CONTACT_PHONE), address = v(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS);
  const set = !!(email || phone);
  return (<main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6"><Link href="/" className="text-brand">← SmartFin AI</Link>
    <h1 className="mt-4 text-2xl font-semibold">Contact us</h1><p className="mt-1 text-muted">Questions, payment problems or refund requests.</p>
    {!set && <p role="status" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-warn">Contact details have not been added yet. The site owner needs to set NEXT_PUBLIC_CONTACT_EMAIL and NEXT_PUBLIC_CONTACT_PHONE.</p>}
    <dl className="mt-6 grid gap-3">
      {name && <div><dt className="font-medium">Business name</dt><dd>{name}</dd></div>}
      {email && <div><dt className="font-medium">Email</dt><dd><a href={`mailto:${email}`} className="text-brand underline">{email}</a></dd></div>}
      {phone && <div><dt className="font-medium">Phone</dt><dd><a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="text-brand underline">{phone}</a></dd></div>}
      {address && <div><dt className="font-medium">Address</dt><dd>{address}</dd></div>}
    </dl>
    <h2 className="mt-6 font-medium">For payment problems</h2><p>Please include the payment ID (it starts with <code>pay_</code>), the amount and the date. We aim to reply within 2 working days. See the <Link href="/refund" className="text-brand underline">refund &amp; cancellation policy</Link> for how refunds work.</p></main>);
}
