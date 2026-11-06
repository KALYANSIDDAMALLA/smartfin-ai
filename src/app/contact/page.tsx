import { BackHome } from "@/components/back-home";
export const metadata = { title: "Contact · SmartFin AI" };
/** Real contact details come from environment settings so no personal data is hard-coded in the repo. */
const v = (x: string | undefined) => (x ?? "").trim();
export default function Contact() {
  const name = v(process.env.NEXT_PUBLIC_BUSINESS_NAME), role = v(process.env.NEXT_PUBLIC_CONTACT_ROLE), email = v(process.env.NEXT_PUBLIC_CONTACT_EMAIL), phone = v(process.env.NEXT_PUBLIC_CONTACT_PHONE), address = v(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS);
  const set = !!(email || phone);
  return (<main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6"><BackHome />
    <h1 className="mt-4 text-2xl font-semibold">Contact us</h1><p className="mt-1 text-muted">Questions or problems with SmartFin AI.</p>
    {!set && <p role="status" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-warn">Contact details have not been added yet. The site owner needs to set NEXT_PUBLIC_CONTACT_EMAIL and NEXT_PUBLIC_CONTACT_PHONE.</p>}
    <dl className="mt-6 grid gap-3">
      {name && <div><dt className="font-medium">Name</dt><dd>{name}</dd></div>}
      {role && <div><dt className="font-medium">Profession</dt><dd>{role}</dd></div>}
      {email && <div><dt className="font-medium">Email</dt><dd><a href={`mailto:${email}`} className="inline-block py-1.5 text-brand underline">{email}</a></dd></div>}
      {phone && <div><dt className="font-medium">Phone</dt><dd><a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="inline-block py-1.5 text-brand underline">{phone}</a></dd></div>}
      {address && <div><dt className="font-medium">Address</dt><dd>{address}</dd></div>}
    </dl>
    <h2 className="mt-6 font-medium">What to include</h2><p>Tell us what you were doing and what you saw, and the email you signed up with. We aim to reply within 2 working days.</p></main>);
}
