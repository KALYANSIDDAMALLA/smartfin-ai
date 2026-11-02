-- Razorpay on "Bank account links" (test mode): verify an account's UPI id, add money with Checkout, and tie payouts to an account.
-- Needs 20261101000009_razorpay.sql first. No full account numbers or UPI ids are stored, only masked forms.
create table account_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  upi_masked text not null,
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  registered_name text check (registered_name is null or char_length(registered_name) <= 200), -- name the bank has on record, as returned by Razorpay
  validation_id text unique,                                                                    -- fav_…
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references accounts(id, user_id) on delete cascade
);
create index idx_acct_verif on account_verifications (user_id, account_id, created_at desc);
create trigger trg_acct_verif_upd before update on account_verifications for each row execute function set_updated_at();

create table razorpay_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null unique,
  account_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'created' check (status in ('created','paid')),
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references accounts(id, user_id) on delete cascade
);
create index idx_rzp_topups on razorpay_topups (user_id, created_at desc);
create trigger trg_rzp_topups_upd before update on razorpay_topups for each row execute function set_updated_at();

alter table razorpayx_payouts add column if not exists account_id uuid; -- which of your accounts the payout was started from (no FK: a removed account keeps its history)

do $$
declare t text;
begin
  foreach t in array array['account_verifications','razorpay_topups'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (user_id = auth.uid())', t||'_sel', t);
    execute format('create policy %I on %I for insert with check (user_id = auth.uid())', t||'_ins', t);
    execute format('create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_upd', t);
  end loop;
end $$;
