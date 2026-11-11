-- Instant bank alerts: a phone forwards each bank/UPI SMS to /api/sms/ingest with a private token.
-- Safety model: only a SHA-256 hash of the token is stored (the token itself is shown once). Users can read their own row; every write comes from the
-- server (service role) after the session user is verified. Forwarded messages are only ever STAGED for review, never written straight to the ledger.
create table if not exists sms_forwarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,                 -- last 4 characters, so the user can tell which token is active
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  received_count int not null default 0
);
alter table sms_forwarding enable row level security;
drop policy if exists sms_forwarding_sel on sms_forwarding;
create policy sms_forwarding_sel on sms_forwarding for select using (user_id = auth.uid());
revoke all on sms_forwarding from anon, authenticated;
grant select (user_id, token_hint, created_at, last_used_at, received_count) on sms_forwarding to authenticated;

alter table import_batches drop constraint if exists import_batches_file_kind_check;
alter table import_batches add constraint import_batches_file_kind_check check (file_kind in ('csv','xlsx','pdf','image','aa','sms'));
