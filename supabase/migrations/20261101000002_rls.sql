-- Row Level Security: a user can only see/modify rows where user_id = auth.uid().
-- Policies use WITH CHECK so a client cannot insert/move rows to another user.
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','payment_methods','recurring_rules','import_batches','attachments','transactions',
    'staged_import_transactions','budgets','budget_alert_state','financial_goals','goal_contributions',
    'savings_plans','notifications','ai_insights','ai_conversations','ai_messages','integration_connections',
    'integration_consents','sync_runs','user_preferences'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (user_id = auth.uid())', t||'_sel', t);
    execute format('create policy %I on %I for insert with check (user_id = auth.uid())', t||'_ins', t);
    execute format('create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_upd', t);
    execute format('create policy %I on %I for delete using (user_id = auth.uid())', t||'_del', t);
  end loop;
end $$;

-- profiles keyed by id
alter table profiles enable row level security;
create policy profiles_sel on profiles for select using (id = auth.uid());
create policy profiles_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- audit: users may read their own; nobody can write via the client API (triggers/service role only)
alter table audit_events enable row level security;
create policy audit_sel on audit_events for select using (user_id = auth.uid());

-- secrets: RLS on with NO policies => inaccessible to anon/authenticated; service_role bypasses RLS.
alter table integration_secrets enable row level security;

-- Clients must not forge system-generated records.
revoke insert, update, delete on audit_events from anon, authenticated;
revoke all on integration_secrets from anon, authenticated;
revoke insert on notifications from authenticated; -- notifications are created server-side

-- Private storage: bucket 'private-files', objects must live under '<user_id>/...'
insert into storage.buckets (id, name, public, file_size_limit)
values ('private-files','private-files', false, 10485760) on conflict (id) do nothing;
create policy storage_own_select on storage.objects for select using (bucket_id='private-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_insert on storage.objects for insert with check (bucket_id='private-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_delete on storage.objects for delete using (bucket_id='private-files' and (storage.foldername(name))[1] = auth.uid()::text);
