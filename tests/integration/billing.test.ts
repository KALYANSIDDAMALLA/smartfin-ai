// Requires TEST_DATABASE_URL pointing at a DB with migrations applied (including 20261101000013_billing.sql).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("billing: fulfil_payment and RLS", () => {
  let db: Client; let A: string; let B: string; const sfx = Date.now();
  const order = async (uid: string, id: string, amount = 9900) =>
    db.query("insert into payment_orders(user_id,plan_code,period_days,order_id,amount_minor) values ($1,'pro_monthly',30,$2,$3)", [uid, id, amount]);
  const fulfil = async (o: string, p: string, amt = 9900, cur = "INR") => (await db.query("select fulfil_payment($1,$2,$3,$4) r", [o, p, amt, cur])).rows[0].r as string;
  const as = async <T>(uid: string, fn: () => Promise<T>) => { await db.query("begin"); try { await db.query("set local role authenticated"); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); const r = await fn(); await db.query("commit"); return r; } catch (e) { await db.query("rollback"); throw e; } };

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect();
    const mk = async (e: string) => (await db.query("insert into auth.users(email) values ($1) returning id", [e])).rows[0].id as string;
    A = await mk(`ba${sfx}@t.dev`); B = await mk(`bb${sfx}@t.dev`);
  });
  afterAll(async () => { await db.query("delete from payment_orders where order_id like $1", [`order_t${sfx}%`]); await db.query("delete from auth.users where id = any($1)", [[A, B]]); await db.end(); });

  it("grants Pro once; a repeat is a harmless duplicate and does not extend again", async () => {
    await order(A, `order_t${sfx}a`);
    expect(await fulfil(`order_t${sfx}a`, `pay_t${sfx}a`)).toBe("paid");
    const first = (await db.query("select plan, pro_until from user_plans where user_id=$1", [A])).rows[0];
    expect(first.plan).toBe("pro");
    expect(await fulfil(`order_t${sfx}a`, `pay_t${sfx}a`)).toBe("duplicate");
    expect((await db.query("select pro_until from user_plans where user_id=$1", [A])).rows[0].pro_until).toEqual(first.pro_until);
  });
  it("refuses a wrong amount or currency and does not grant", async () => {
    await order(B, `order_t${sfx}b`);
    expect(await fulfil(`order_t${sfx}b`, `pay_t${sfx}b`, 100)).toBe("mismatch");
    expect((await db.query("select 1 from user_plans where user_id=$1", [B])).rowCount).toBe(0);
  });
  it("unknown orders are rejected, and one payment id cannot fulfil two orders", async () => {
    expect(await fulfil(`order_t${sfx}nope`, `pay_t${sfx}z`)).toBe("unknown");
    await order(B, `order_t${sfx}c`); await order(B, `order_t${sfx}d`);
    expect(await fulfil(`order_t${sfx}c`, `pay_t${sfx}cd`)).toBe("paid");
    expect(await fulfil(`order_t${sfx}d`, `pay_t${sfx}cd`)).toBe("conflict");
  });
  it("users can read only their own orders and can never write or call fulfil_payment", async () => {
    expect((await as(A, () => db.query("select order_id from payment_orders"))).rows.every((r) => String(r.order_id).startsWith("order_t"))).toBe(true);
    expect((await as(A, () => db.query("select 1 from payment_orders where user_id=$1", [B]))).rowCount).toBe(0);
    await expect(as(A, () => db.query("update user_plans set plan='pro'"))).rejects.toThrow();
    await expect(as(A, () => db.query("insert into payment_orders(user_id,plan_code,period_days,order_id,amount_minor) values ($1,'pro_monthly',30,'order_x',1)", [A]))).rejects.toThrow();
    await expect(as(A, () => db.query("select fulfil_payment('o','p',1,'INR')"))).rejects.toThrow();
  });
});
