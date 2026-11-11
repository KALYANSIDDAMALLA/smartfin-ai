"use client";
import { useEffect, useRef, useState } from "react";
import { Field, inputCls } from "./ui";

const LATIN1 = new TextDecoder("latin1");
/** Locked PDFs carry an /Encrypt entry in their trailer or cross-reference stream. A plain byte search is enough to decide whether to ask for a password. */
async function lockState(f: File): Promise<"pdf-locked" | "xlsx-locked" | null> {
  const name = f.name.toLowerCase();
  if (name.endsWith(".pdf")) { const t = LATIN1.decode(new Uint8Array(await f.arrayBuffer())); return /\/Encrypt\b/.test(t) ? "pdf-locked" : null; }
  if (name.endsWith(".xlsx")) { const h = new Uint8Array(await f.slice(0, 4).arrayBuffer()); return h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0 ? "xlsx-locked" : null; } // password-protected Excel is an OLE file, not a zip
  return null;
}

/** File picker that notices a locked file on selection and asks for the password right there, before anything is uploaded. */
export function ImportFileField() {
  const [lock, setLock] = useState<"pdf-locked" | "xlsx-locked" | null>(null); const [name, setName] = useState("");
  const pw = useRef<HTMLInputElement>(null); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const form = root.current?.closest("form"); const clear = () => { setLock(null); setName(""); }; form?.addEventListener("reset", clear); return () => form?.removeEventListener("reset", clear); }, []);
  useEffect(() => { if (lock === "pdf-locked") pw.current?.focus(); }, [lock]);
  return (
    <div ref={root}>
      <Field label="File (max 10 MB)" hint="CSV, XLSX, PDF, PNG or JPG. Files are stored privately and only parsed — never executed.">
        <input type="file" name="file" required accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg" className={inputCls + " h-auto cursor-pointer py-2 pl-2 text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-linear-to-b file:from-brand file:to-brand/85 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brandfg file:shadow-sm file:shadow-brand/25 file:transition hover:file:brightness-110 focus-visible:outline-2 focus-visible:outline-brand"}
          onChange={async (e) => { const f = e.currentTarget.files?.[0]; setName(f?.name ?? ""); setLock(f ? await lockState(f).catch(() => null) : null); }} />
      </Field>
      {lock === "pdf-locked" && <div role="status" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3">
        <p className="mb-2 text-sm"><b>{name} is password-protected.</b> Enter its password to read it. You&apos;ll preview the transactions before anything is saved.</p>
        <Field label="PDF password" hint="Banks often use your date of birth (DDMMYYYY or DDMMYY), customer ID, mobile number, or the first letters of your name plus your birth date. Used once to open the file, never saved.">
          <input ref={pw} type="password" name="password" required autoComplete="off" maxLength={200} className={inputCls} />
        </Field></div>}
      {lock === "xlsx-locked" && <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm"><b>{name} is a password-protected Excel file</b>, which can&apos;t be opened here. In Excel use File &gt; Info &gt; Protect Workbook &gt; Encrypt with Password, clear the password, save, and choose the file again. Or upload the bank&apos;s PDF or CSV statement instead.</p>}
    </div>
  );
}
