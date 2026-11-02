-- Lets a signed-in user delete ONLY their own account, without any service_role key in the app.
-- SECURITY DEFINER runs as the function owner; identity comes from auth.uid() (the verified JWT), never from an argument.
create or replace function delete_my_account(p_reason text, p_detail text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into audit_events(user_id, action, entity, entity_id, after)
  values (uid, 'delete_account', 'user', uid,
          jsonb_build_object('reason', left(coalesce(p_reason, ''), 100)) || case when p_detail is null or p_detail = '' then '{}'::jsonb else jsonb_build_object('detail', left(p_detail, 300)) end);
  delete from auth.users where id = uid; -- cascades to profiles and every user-owned table
end $$;
revoke all on function delete_my_account(text, text) from public, anon;
grant execute on function delete_my_account(text, text) to authenticated;
