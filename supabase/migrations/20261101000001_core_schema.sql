-- SmartFin AI core schema. All money columns are bigint minor units (paise).
-- Every user-owned table has user_id -> auth.users and RLS (see 0002).
create extension if not exists pgcrypto;

create type tx_type as enum ('income','expense','transfer','refund','adjustment');
create type channel_kind as enum ('online','offline');
create type tx_source as enum ('manual','import_csv','import_xlsx','import_pdf','receipt_ocr','recurring','integration');
create type account_kind as enum ('bank','cash','credit_card','wallet','other');
create type budget_period as enum ('daily','weekly','monthly','yearly');
create type goal_status as enum ('active','paused','completed');
create type import_status as enum ('uploaded','processing','preview','confirmed','failed','cancelled');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- profiles (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_upd before update on profiles for each row execute function set_updated_at();

create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  email_notifications boolean not null default false,
  push_notifications boolean not null default false,
  notify_daily boolean not null default false,
  notify_weekly boolean not null default true,
  notify_monthly boolean not null default true,
  notify_yearly boolean not null default true,
  updated_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  kind account_kind not null,
  currency char(3) not null default 'INR',
  opening_balance_minor bigint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  parent_id uuid,
  kind text not null default 'expense' check (kind in ('expense','income')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name),
  foreign key (parent_id, user_id) references categories(id, user_id) on delete set null (parent_id)
);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null, -- upi, gpay, phonepe, cash, credit_card ...
  label text not null,
  channel channel_kind not null,
  unique (id, user_id),
  unique (user_id, code)
);

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tx_type tx_type not null default 'expense' check (tx_type in ('income','expense')),
  estimated_amount_minor bigint not null check (estimated_amount_minor > 0),
  category_id uuid,
  payment_method_id uuid,
  frequency text not null check (frequency in ('daily','weekly','monthly','quarterly','yearly')),
  next_due_date date not null,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references categories(id, user_id),
  foreign key (payment_method_id, user_id) references payment_methods(id, user_id)
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_kind text not null check (file_kind in ('csv','xlsx','pdf','image')),
  storage_path text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text,
  status import_status not null default 'uploaded',
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (id, user_id)
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, -- private bucket, path prefix = user_id/
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (storage_path like user_id::text || '/%')
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type tx_type not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'INR',
  occurred_at timestamptz not null,
  category_id uuid,
  subcategory text,
  name text,
  description text,
  merchant text,
  payment_method_id uuid,
  channel channel_kind,
  source tx_source not null default 'manual',
  external_ref text,
  notes text,
  tags text[] not null default '{}',
  attachment_id uuid,
  recurring_rule_id uuid,
  import_batch_id uuid,
  from_account_id uuid,
  to_account_id uuid,
  refund_of_id uuid,
  direction text check (direction in ('in','out')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references categories(id, user_id),
  foreign key (payment_method_id, user_id) references payment_methods(id, user_id),
  foreign key (attachment_id, user_id) references attachments(id, user_id),
  foreign key (recurring_rule_id, user_id) references recurring_rules(id, user_id),
  foreign key (import_batch_id, user_id) references import_batches(id, user_id),
  foreign key (from_account_id, user_id) references accounts(id, user_id),
  foreign key (to_account_id, user_id) references accounts(id, user_id),
  foreign key (refund_of_id, user_id) references transactions(id, user_id),
  check (type <> 'transfer' or (from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)),
  check (type <> 'adjustment' or direction is not null)
);
create unique index uq_tx_external_ref on transactions (user_id, external_ref) where external_ref is not null and deleted_at is null;
create index idx_tx_user_time on transactions (user_id, occurred_at desc) where deleted_at is null;
create index idx_tx_user_cat on transactions (user_id, category_id);
create index idx_tx_user_merchant on transactions (user_id, lower(merchant));
create trigger trg_tx_upd before update on transactions for each row execute function set_updated_at();

create table staged_import_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  row_index int not null,
  raw jsonb not null,
  amount_minor bigint,
  occurred_at timestamptz,
  merchant text,
  description text,
  tx_type tx_type,
  category_id uuid,
  external_ref text,
  confidence numeric(3,2) check (confidence between 0 and 1),
  is_duplicate boolean not null default false,
  duplicate_reason text,
  include boolean not null default true,
  foreign key (batch_id, user_id) references import_batches(id, user_id) on delete cascade,
  foreign key (category_id, user_id) references categories(id, user_id)
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  period budget_period not null,
  amount_minor bigint not null check (amount_minor > 0),
  category_id uuid,
  channel channel_kind,
  alert_thresholds int[] not null default '{50,75,90,100}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references categories(id, user_id)
);

-- Tracks fired alerts so one threshold crossing in one period alerts once.
create table budget_alert_state (
  budget_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  threshold int not null,
  fired_at timestamptz not null default now(),
  primary key (budget_id, period_start, threshold),
  foreign key (budget_id, user_id) references budgets(id, user_id) on delete cascade
);

create table financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'custom',
  description text,
  target_minor bigint not null check (target_minor > 0),
  target_date date,
  contribution_frequency text check (contribution_frequency in ('daily','weekly','monthly','yearly')),
  status goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Goal contributions are savings allocations, NOT transactions/expenses.
create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0), -- negative = withdrawal
  contributed_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references financial_goals(id, user_id) on delete cascade
);

create table savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_income_minor bigint not null default 0,
  essential_minor bigint not null default 0,
  discretionary_minor bigint not null default 0,
  commitments_minor bigint not null default 0,
  current_savings_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notif_user on notifications (user_id, created_at desc);

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null,   -- verified backend metrics used as input
  insights jsonb not null,  -- validated AI output
  model text,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now()
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references ai_conversations(id, user_id) on delete cascade
);

create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'pending_configuration' check (status in ('pending_configuration','connected','revoked','error')),
  -- Provider tokens are NEVER stored here; they live in a server-only table (no RLS policies => no client access).
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table integration_secrets ( -- server (service_role) only; RLS on, zero policies
  connection_id uuid primary key references integration_connections(id) on delete cascade,
  encrypted_token bytea not null
);
create table integration_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid,
  provider text not null,
  scopes text[] not null,
  action text not null check (action in ('granted','revoked')),
  created_at timestamptz not null default now()
);
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  status text not null check (status in ('running','success','failed')),
  imported_count int not null default 0,
  duplicate_count int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (connection_id, user_id) references integration_connections(id, user_id) on delete cascade
);

-- Append-only audit trail (also used for financial corrections history).
create table audit_events (
  id bigint generated always as identity primary key,
  user_id uuid, -- intentionally no FK: audit rows must survive (and not block) account deletion
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_user on audit_events (user_id, created_at desc);

-- Audit trigger for transactions: records before/after on update & delete (no secrets involved).
create or replace function audit_transactions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    insert into audit_events(user_id, action, entity, entity_id, before, after) values (old.user_id,'update','transaction',old.id,to_jsonb(old),to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_events(user_id, action, entity, entity_id, before) values (old.user_id,'delete','transaction',old.id,to_jsonb(old));
    return old;
  end if;
  return null;
end $$;
create trigger trg_tx_audit after update or delete on transactions for each row execute function audit_transactions();

-- Seed profile, preferences and default categories/payment methods for each new user.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  insert into profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into user_preferences(user_id) values (new.id);
  foreach c in array array['Food and groceries','Shopping','Transportation','Education','Healthcare','Rent','Utilities','Entertainment','Travel','Subscriptions','Personal','Insurance','Loan payments','Other'] loop
    insert into categories(user_id,name,kind,is_default) values (new.id,c,'expense',true);
  end loop;
  foreach c in array array['Salary','Business','Freelance','Rental','Interest','Investment','Gift','Other'] loop
    insert into categories(user_id,name,kind,is_default) values (new.id,c,'income',true);
  end loop;
  insert into payment_methods(user_id,code,label,channel) values
    (new.id,'upi','UPI','online'),(new.id,'gpay','Google Pay','online'),(new.id,'phonepe','PhonePe','online'),
    (new.id,'paytm','Paytm','online'),(new.id,'bhim','BHIM','online'),(new.id,'debit_card','Debit card','online'),
    (new.id,'credit_card','Credit card','online'),(new.id,'contactless','Contactless','online'),
    (new.id,'net_banking','Net banking','online'),(new.id,'neft','NEFT','online'),(new.id,'rtgs','RTGS','online'),
    (new.id,'imps','IMPS','online'),(new.id,'wallet','Digital wallet','online'),(new.id,'ecommerce','E-commerce','online'),
    (new.id,'subscription','Subscription','online'),(new.id,'cash','Cash','offline');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
