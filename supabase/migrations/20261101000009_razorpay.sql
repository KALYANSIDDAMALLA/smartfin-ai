-- Razorpay (test mode) bookkeeping. Money itself is still recorded in the normal ledger (transactions / loan_payments);
-- these tables only track the provider's order / payout ids and statuses so a payment can be verified once and never recorded twice.
create table razorpay_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null unique,                       -- Razorpay order id (order_…), not a secret
  loan_id uuid not null,
  installment_no int not null check (installment_no >= 1),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'created' check (status in ('created','paid','failed')),
  payment_id text,                                     -- pay_… once paid
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (loan_id, user_id) references loans(id, user_id) on delete cascade
);
create index idx_rzp_orders_user on razorpay_orders (user_id, created_at desc);
create trigger trg_rzp_orders_upd before update on razorpay_orders for each row execute function set_updated_at();

create table razorpayx_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payout_id text unique,                               -- pout_…
  payee_name text not null check (char_length(payee_name) between 1 and 100),
  upi_masked text not null,                            -- e.g. "ra••••@okhdfc"; the full UPI id is not stored
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'queued',               -- provider's own status: queued, pending, processing, processed, reversed, cancelled, rejected, failed
  utr text,
  note text check (note is null or char_length(note) <= 100),
  idempotency_key text not null unique,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index idx_rzpx_payouts_user on razorpayx_payouts (user_id, created_at desc);
create trigger trg_rzpx_payouts_upd before update on razorpayx_payouts for each row execute function set_updated_at();

-- Users can read and create their own rows; status changes come from the verified webhook (service role) or the signed Checkout confirmation.
do $$
declare t text;
begin
  foreach t in array array['razorpay_orders','razorpayx_payouts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (user_id = auth.uid())', t||'_sel', t);
    execute format('create policy %I on %I for insert with check (user_id = auth.uid())', t||'_ins', t);
    execute format('create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_upd', t);
  end loop;
end $$;
