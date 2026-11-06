-- Drafts: half-finished or planned transactions a user saves to finish later. They are NOT ledger entries and never count in any total.
-- planned_for lets a draft appear on the calendar on the day the user expects to complete it.
create table if not exists transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'expense' check (type in ('expense','income')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  name text check (name is null or length(name) <= 200),
  merchant text check (merchant is null or length(merchant) <= 200),
  category_id uuid,
  payment_method_id uuid,
  channel text check (channel is null or channel in ('online','offline')),
  notes text check (notes is null or length(notes) <= 2000),
  planned_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references categories(id, user_id),
  foreign key (payment_method_id, user_id) references payment_methods(id, user_id)
);
create index if not exists idx_drafts_user_planned on transaction_drafts (user_id, planned_for);
alter table transaction_drafts enable row level security;
drop policy if exists transaction_drafts_sel on transaction_drafts; drop policy if exists transaction_drafts_ins on transaction_drafts;
drop policy if exists transaction_drafts_upd on transaction_drafts; drop policy if exists transaction_drafts_del on transaction_drafts;
create policy transaction_drafts_sel on transaction_drafts for select using (user_id = auth.uid());
create policy transaction_drafts_ins on transaction_drafts for insert with check (user_id = auth.uid());
create policy transaction_drafts_upd on transaction_drafts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transaction_drafts_del on transaction_drafts for delete using (user_id = auth.uid());
revoke all on transaction_drafts from anon;
grant select, insert, update, delete on transaction_drafts to authenticated;
