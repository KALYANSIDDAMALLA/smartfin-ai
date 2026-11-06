-- Account Aggregator support: provider consent id + metadata on connections, richer statuses, and an 'aa' import source.
alter table integration_connections add column if not exists external_id text;           -- provider consent id (not a secret)
alter table integration_connections add column if not exists meta jsonb not null default '{}'::jsonb; -- non-sensitive: masked accounts, date range, pending session id
alter table integration_connections drop constraint if exists integration_connections_status_check;
alter table integration_connections add constraint integration_connections_status_check
  check (status in ('pending_configuration','pending_consent','connected','expired','revoked','error'));
alter table import_batches drop constraint if exists import_batches_file_kind_check;
alter table import_batches add constraint import_batches_file_kind_check check (file_kind in ('csv','xlsx','pdf','image','aa'));
create index if not exists idx_integration_conn_user on integration_connections (user_id, created_at desc);
