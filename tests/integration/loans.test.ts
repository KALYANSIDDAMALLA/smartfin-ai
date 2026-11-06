// Requires TEST_DATABASE_URL pointing at a DB with migrations applied (including 20261101000008_loans.sql).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("loans: isolation and integrity", () => {
  let admin: Client; let A: string; let B: string; let loanA: string;
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>): Promise<T> {
    await admin.query("begin");
    try { await admin.query("set local role authenticated"); await admin.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); const r = await fn(admin); await admin.query("commit"); return r; }
    catch (e) { await admin.query("rollback"); throw e; }
  }
  const tryQ = async (uid: string, sql: string, p: unknown[] = []) => { try { return await as(uid, (c) => c.query(sql, p)); } catch (e) { return e as Error; } };
  const ins = "insert into loans(user_id,name,principal_minor,interest_rate_pct,tenure_months,emi_minor,first_due_date) values ($1,'Home',100000000,8.5,240,867823,'2026-12-05') returning id";

  beforeAll(async () => {
    admin = new Client({ connectionString: url }); await admin.connect();
    const mk = async (email: string) => (await admin.query("insert into auth.users(email) values ($1) returning id", [email])).rows[0].id as string;
    const sfx = Date.now(); A = await mk(`la${sfx}@t.dev`); B = await mk(`lb${sfx}@t.dev`);
    loanA = (await as(A, (c) => c.query(ins, [A]))).rows[0].id;
  });
  afterAll(async () => { await admin.query("delete from auth.users where id = any($1)", [[A, B]]); await admin.end(); });

  it("owner sees their loan; another user sees none", async () => {
    expect((await as(A, (c) => c.query("select id from loans"))).rowCount).toBe(1);
    expect((await as(B, (c) => c.query("select id from loans"))).rowCount).toBe(0);
  });
  it("another user cannot update or delete it", async () => {
    expect((await as(B, (c) => c.query("update loans set name='x' where id=$1", [loanA]))).rowCount).toBe(0);
    expect((await as(B, (c) => c.query("delete from loans where id=$1", [loanA]))).rowCount).toBe(0);
  });
  it("cannot create a loan for someone else", async () => { expect(await tryQ(B, ins, [A])).toBeInstanceOf(Error); });
  it("rejects invalid terms", async () => {
    for (const bad of ["principal_minor", "interest_rate_pct", "tenure_months", "emi_minor"]) {
      const vals: Record<string, string> = { principal_minor: "0", interest_rate_pct: "101", tenure_months: "601", emi_minor: "0" };
      const cols = { principal_minor: "100000", interest_rate_pct: "8", tenure_months: "12", emi_minor: "9000", [bad]: vals[bad] } as Record<string, string>;
      const r = await tryQ(A, `insert into loans(user_id,name,principal_minor,interest_rate_pct,tenure_months,emi_minor,first_due_date) values ($1,'Bad',${cols.principal_minor},${cols.interest_rate_pct},${cols.tenure_months},${cols.emi_minor},'2026-12-05')`, [A]);
      expect(r, bad).toBeInstanceOf(Error);
    }
  });
  it("the same instalment cannot be recorded twice", async () => {
    const q = "insert into loan_payments(user_id,loan_id,installment_no,paid_on,amount_minor) values ($1,$2,1,'2026-12-05',867823)";
    expect((await as(A, (c) => c.query(q, [A, loanA]))).rowCount).toBe(1);
    expect(await tryQ(A, q, [A, loanA])).toBeInstanceOf(Error);
  });
  it("another user cannot attach a payment to your loan or read yours", async () => {
    expect(await tryQ(B, "insert into loan_payments(user_id,loan_id,installment_no,paid_on,amount_minor) values ($1,$2,2,'2027-01-05',867823)", [B, loanA])).toBeInstanceOf(Error);
    expect((await as(B, (c) => c.query("select id from loan_payments"))).rowCount).toBe(0);
  });
  it("deleting a loan removes its payments", async () => {
    await as(A, (c) => c.query("delete from loans where id=$1", [loanA]));
    expect((await admin.query("select 1 from loan_payments where loan_id=$1", [loanA])).rowCount).toBe(0);
  });
});
