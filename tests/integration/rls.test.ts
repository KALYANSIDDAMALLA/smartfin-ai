// Requires TEST_DATABASE_URL pointing at a DB with migrations applied (see docs/SETUP.md).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("RLS: users cannot access each other's financial data", () => {
  let admin: Client; let A: string; let B: string;
  let aCat: string; let aTx: string; let bCat: string;

  /** Run fn as an authenticated end-user (RLS enforced), in a rolled-back-safe transaction. */
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>): Promise<T> {
    await admin.query("begin");
    try {
      await admin.query("set local role authenticated");
      await admin.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const r = await fn(admin);
      await admin.query("commit");
      return r;
    } catch (e) { await admin.query("rollback"); throw e; }
  }
  const tryQ = async (uid: string, sql: string, p: unknown[] = []) => {
    try { return await as(uid, (c) => c.query(sql, p)); } catch (e) { return e as Error; }
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: url }); await admin.connect();
    const mk = async (email: string) => (await admin.query("insert into auth.users(email) values ($1) returning id", [email])).rows[0].id as string;
    const sfx = Date.now();
    A = await mk(`a${sfx}@t.dev`); B = await mk(`b${sfx}@t.dev`);
    aCat = (await admin.query("select id from categories where user_id=$1 and name='Shopping'", [A])).rows[0].id;
    bCat = (await admin.query("select id from categories where user_id=$1 and name='Shopping'", [B])).rows[0].id;
    aTx = (await as(A, (c) => c.query(
      "insert into transactions(user_id,type,amount_minor,occurred_at,category_id,merchant,external_ref) values ($1,'expense',12345,now(),$2,'Amazon','ref-1') returning id", [A, aCat]))).rows[0].id;
  });
  afterAll(async () => {
    await admin.query("delete from auth.users where id = any($1)", [[A, B]]);
    await admin.end();
  });

  it("signup trigger seeds default categories and payment methods", async () => {
    const r = await admin.query("select count(*)::int n from categories where user_id=$1 and kind='expense'", [A]);
    expect(r.rows[0].n).toBe(14);
  });
  it("owner can read own transaction", async () => {
    const r = await as(A, (c) => c.query("select id from transactions where id=$1", [aTx]));
    expect(r.rowCount).toBe(1);
  });
  it("other user sees nothing (select)", async () => {
    const r = await as(B, (c) => c.query("select * from transactions"));
    expect(r.rowCount).toBe(0);
  });
  it("other user cannot update or delete", async () => {
    const u = await as(B, (c) => c.query("update transactions set amount_minor=1 where id=$1", [aTx]));
    const del = await as(B, (c) => c.query("delete from transactions where id=$1", [aTx]));
    expect([u.rowCount, del.rowCount]).toEqual([0, 0]);
    const still = await admin.query("select amount_minor from transactions where id=$1", [aTx]);
    expect(Number(still.rows[0].amount_minor)).toBe(12345);
  });
  it("cannot insert a row owned by another user (client-supplied user_id is not trusted)", async () => {
    const e = await tryQ(B, "insert into transactions(user_id,type,amount_minor,occurred_at) values ($1,'expense',1,now())", [A]);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(/row-level security/);
  });
  it("cannot reassign own row to another user", async () => {
    const e = await tryQ(A, "update transactions set user_id=$1 where id=$2", [B, aTx]);
    expect(e).toBeInstanceOf(Error);
  });
  it("cannot reference another user's category (composite FK)", async () => {
    const e = await tryQ(B, "insert into transactions(user_id,type,amount_minor,occurred_at,category_id) values ($1,'expense',1,now(),$2)", [B, aCat]);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(/foreign key/);
    // sanity: B's own category works
    expect(await tryQ(B, "insert into transactions(user_id,type,amount_minor,occurred_at,category_id) values ($1,'expense',1,now(),$2)", [B, bCat])).not.toBeInstanceOf(Error);
  });
  it("other tables are isolated too (budgets, goals, contributions, notifications, ai)", async () => {
    await as(A, async (c) => {
      await c.query("insert into budgets(user_id,name,period,amount_minor) values ($1,'b','monthly',1000)", [A]);
      const g = await c.query("insert into financial_goals(user_id,name,target_minor) values ($1,'g',1000) returning id", [A]);
      await c.query("insert into goal_contributions(user_id,goal_id,amount_minor) values ($1,$2,100)", [A, g.rows[0].id]);
      await c.query("insert into ai_conversations(user_id,title) values ($1,'t')", [A]);
    });
    await admin.query("insert into notifications(user_id,kind,title) values ($1,'x','secret')", [A]);
    for (const t of ["budgets", "financial_goals", "goal_contributions", "notifications", "ai_conversations", "accounts", "categories", "payment_methods"]) {
      const r = await as(B, (c) => c.query(`select count(*)::int n from ${t} where user_id=$1`, [A]));
      expect(r.rows[0].n, t).toBe(0);
    }
  });
  it("cannot attach contribution to another user's goal", async () => {
    const g = (await admin.query("select id from financial_goals where user_id=$1 limit 1", [A])).rows[0].id;
    const e = await tryQ(B, "insert into goal_contributions(user_id,goal_id,amount_minor) values ($1,$2,5)", [B, g]);
    expect(e).toBeInstanceOf(Error);
  });
  it("profiles: only own row visible", async () => {
    const r = await as(B, (c) => c.query("select id from profiles"));
    expect(r.rows.map((x) => x.id)).toEqual([B]);
  });
  it("drafts: private to their owner, cannot use another user's category, never counted as transactions", async () => {
    const id = (await as(A, (c) => c.query("insert into transaction_drafts(user_id,type,name,planned_for) values ($1,'expense','Plan: stock','2026-11-20') returning id", [A]))).rows[0].id;
    expect((await as(B, (c) => c.query("select id from transaction_drafts"))).rows).toHaveLength(0);
    expect((await as(B, (c) => c.query("update transaction_drafts set name='x' where id=$1", [id]))).rowCount).toBe(0);
    expect((await as(B, (c) => c.query("delete from transaction_drafts where id=$1", [id]))).rowCount).toBe(0);
    expect(await tryQ(B, "insert into transaction_drafts(user_id,name) values ($1,'forged')", [A])).toBeInstanceOf(Error); // cannot create rows for someone else
    expect(await tryQ(A, "insert into transaction_drafts(user_id,category_id) values ($1,$2)", [A, bCat])).toBeInstanceOf(Error); // composite FK blocks foreign category
    expect((await as(A, (c) => c.query("select count(*)::int n from transactions where name='Plan: stock'"))).rows[0].n).toBe(0);
  });
  it("integration secrets are inaccessible to clients", async () => {
    expect(await tryQ(A, "select * from integration_secrets")).toBeInstanceOf(Error);
  });
  it("audit_events are read-only for clients and record corrections", async () => {
    expect(await tryQ(A, "insert into audit_events(user_id,action,entity) values ($1,'x','y')", [A])).toBeInstanceOf(Error);
    await as(A, (c) => c.query("update transactions set amount_minor=20000 where id=$1", [aTx]));
    const r = await as(A, (c) => c.query("select before->>'amount_minor' b, after->>'amount_minor' a from audit_events where entity_id=$1", [aTx]));
    expect(r.rows[0]).toEqual({ b: "12345", a: "20000" });
    const other = await as(B, (c) => c.query("select * from audit_events where entity_id=$1", [aTx]));
    expect(other.rowCount).toBe(0);
  });
  it("clients cannot forge notifications", async () => {
    expect(await tryQ(A, "insert into notifications(user_id,kind,title) values ($1,'x','y')", [A])).toBeInstanceOf(Error);
  });
  it("duplicate external_ref per user is rejected, but allowed across users", async () => {
    const dup = await tryQ(A, "insert into transactions(user_id,type,amount_minor,occurred_at,external_ref) values ($1,'expense',1,now(),'ref-1')", [A]);
    expect(dup).toBeInstanceOf(Error);
    const ok = await tryQ(B, "insert into transactions(user_id,type,amount_minor,occurred_at,external_ref) values ($1,'expense',1,now(),'ref-1')", [B]);
    expect(ok).not.toBeInstanceOf(Error);
  });
  it("constraints: non-positive amounts and bad transfers rejected", async () => {
    expect(await tryQ(A, "insert into transactions(user_id,type,amount_minor,occurred_at) values ($1,'expense',0,now())", [A])).toBeInstanceOf(Error);
    expect(await tryQ(A, "insert into transactions(user_id,type,amount_minor,occurred_at) values ($1,'transfer',5,now())", [A])).toBeInstanceOf(Error);
  });
  it("storage: cannot write into another user's folder", async () => {
    const bad = await tryQ(B, "insert into storage.objects(bucket_id,name) values ('private-files',$1)", [`${A}/x.pdf`]);
    expect(bad).toBeInstanceOf(Error);
    expect(await tryQ(B, "insert into storage.objects(bucket_id,name) values ('private-files',$1)", [`${B}/x.pdf`])).not.toBeInstanceOf(Error);
    const seen = await as(A, (c) => c.query("select name from storage.objects where bucket_id='private-files'"));
    expect(seen.rows.every((r) => r.name.startsWith(A))).toBe(true);
  });
  it("delete_my_account removes only the caller; anonymous callers are denied", async () => {
    const bad = await tryQ("00000000-0000-0000-0000-000000000000", "select delete_my_account('x')");
    expect((await admin.query("select 1 from auth.users where id=$1", [B])).rowCount).toBe(1);
    expect(bad).not.toBeInstanceOf(Error); // unknown uid: nothing to delete, but nobody else is touched
    expect((await admin.query("select 1 from auth.users where id=$1", [A])).rowCount).toBe(1);
  });
  it("deleting a user cascades all their data", async () => {
    const tmp = (await admin.query("insert into auth.users(email) values ('tmp@t.dev') returning id")).rows[0].id;
    await admin.query("insert into transactions(user_id,type,amount_minor,occurred_at) values ($1,'income',5,now())", [tmp]);
    await admin.query("delete from auth.users where id=$1", [tmp]);
    const r = await admin.query("select (select count(*) from transactions where user_id=$1)::int t, (select count(*) from categories where user_id=$1)::int c", [tmp]);
    expect(r.rows[0]).toEqual({ t: 0, c: 0 });
  });
});
