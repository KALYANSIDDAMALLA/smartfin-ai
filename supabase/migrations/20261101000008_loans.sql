-- Loans and their instalment payments. Each paid EMI is also recorded as a normal expense transaction (so analytics, budgets and
-- reports include it); loan_payments links the instalment number to that transaction.
create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  lender text check (lender is null or char_length(lender) <= 100),
  kind text not null default 'personal' check (kind in ('home','vehicle','personal','business','education','gold','credit_card','other')),
  principal_minor bigint not null check (principal_minor > 0),
  interest_rate_pct numeric(6,3) not null check (interest_rate_pct >= 0 and interest_rate_pct <= 100),
  tenure_months int not null check (tenure_months between 1 and 600),
  emi_minor bigint not null check (emi_minor > 0),
  first_due_date date not null,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index idx_loans_user on loans (user_id, status);
create trigger trg_loans_upd before update on loans for each row execute function set_updated_at();

create table loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null,
  installment_no int not null check (installment_no >= 1),
  paid_on date not null,
  amount_minor bigint not null check (amount_minor > 0),
  transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (loan_id, installment_no), -- the same instalment can never be recorded twice (also stops a double click)
  foreign key (loan_id, user_id) references loans(id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references transactions(id, user_id)
);
create index idx_loan_payments_loan on loan_payments (loan_id, installment_no);

do $$
declare t text;
begin
  foreach t in array array['loans','loan_payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (user_id = auth.uid())', t||'_sel', t);
    execute format('create policy %I on %I for insert with check (user_id = auth.uid())', t||'_ins', t);
    execute format('create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_upd', t);
    execute format('create policy %I on %I for delete using (user_id = auth.uid())', t||'_del', t);
  end loop;
end $$;
