-- Plans and Razorpay payments. Everyone is on the free plan; 'pro' is granted ONLY by fulfil_payment() after a verified payment.
--
-- Safety model:
--   * Clients (anon / authenticated) can READ their own rows and can never write to any of these tables (no write policies, no write grants).
--   * All writes come from the server using the service-role key, after Razorpay's signature has been verified.
--   * fulfil_payment() is the single place an order becomes paid. It locks the order row, checks the amount and currency against what we stored
--     when the order was created, and is idempotent, so the browser confirmation and the webhook can both call it without ever granting twice.
--   * Payment records are kept if a user deletes their account (user_id is set to null) because payment records may need to be retained for accounting.

create table user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  pro_until timestamptz,                       -- null while on free
  updated_at timestamptz not null default now()
);
alter table user_plans enable row level security;
create policy user_plans_sel on user_plans for select using (user_id = auth.uid());
revoke all on user_plans from anon, authenticated;
grant select on user_plans to authenticated;

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,   -- customer id; kept (nulled) after account deletion
  customer_name text,
  customer_email text,
  plan_code text not null check (plan_code in ('pro_monthly','pro_yearly')),
  period_days int not null check (period_days > 0),
  order_id text not null unique,               -- Razorpay order id (order_…)
  payment_id text unique,                      -- Razorpay payment id (pay_…); unique so one payment can never fulfil two orders
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed','cancelled')),
  failure_reason text,
  mode text not null default 'test' check (mode in ('test','live')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index idx_payment_orders_user on payment_orders (user_id, created_at desc);
create trigger trg_payment_orders_upd before update on payment_orders for each row execute function set_updated_at();
alter table payment_orders enable row level security;
create policy payment_orders_sel on payment_orders for select using (user_id = auth.uid());
revoke all on payment_orders from anon, authenticated;
grant select on payment_orders to authenticated;

-- Webhook event ids already processed (Razorpay retries, and the same event can arrive twice).
create table payment_events (
  event_id text primary key,
  event text not null,
  received_at timestamptz not null default now()
);
alter table payment_events enable row level security;
revoke all on payment_events from anon, authenticated;

-- Returns 'paid' (this call granted the plan), 'duplicate' (already paid, nothing changed), 'mismatch' (amount/currency differ: NOT granted),
-- 'unknown' (no such order) or 'conflict' (this payment id is already attached to another order).
create or replace function fulfil_payment(p_order_id text, p_payment_id text, p_amount_minor bigint, p_currency text)
returns text language plpgsql security definer set search_path = public as $$
declare o payment_orders%rowtype; base timestamptz;
begin
  select * into o from payment_orders where order_id = p_order_id for update;
  if not found then return 'unknown'; end if;
  if o.status = 'paid' then return 'duplicate'; end if;
  if o.amount_minor <> p_amount_minor or o.currency <> upper(p_currency) then
    update payment_orders set status = 'failed', failure_reason = 'Paid amount did not match the order' where id = o.id;
    return 'mismatch';
  end if;
  if exists (select 1 from payment_orders where payment_id = p_payment_id and id <> o.id) then return 'conflict'; end if;
  update payment_orders set status = 'paid', payment_id = p_payment_id, paid_at = now(), failure_reason = null where id = o.id;
  if o.user_id is not null then
    -- Renewing early extends from the current end date instead of losing the days already paid for.
    select greatest(now(), coalesce((select pro_until from user_plans where user_id = o.user_id and plan = 'pro'), now())) into base;
    insert into user_plans (user_id, plan, pro_until) values (o.user_id, 'pro', base + make_interval(days => o.period_days))
    on conflict (user_id) do update set plan = 'pro', pro_until = excluded.pro_until, updated_at = now();
  end if;
  return 'paid';
end $$;
revoke all on function fulfil_payment(text, text, bigint, text) from public, anon, authenticated;
grant execute on function fulfil_payment(text, text, bigint, text) to service_role;
