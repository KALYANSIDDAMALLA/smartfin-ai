-- Lets the signed-in user's own server session create notifications for THEMSELVES (budget alerts, goal milestones, unusual-spend,
-- import results) without a service_role key. Identity comes from auth.uid(); no user id is accepted as an argument.
create or replace function notify_me(p_kind text, p_title text, p_body text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into notifications (user_id, kind, title, body) values (auth.uid(), left(coalesce(p_kind, 'info'), 40), left(coalesce(p_title, ''), 200), left(p_body, 500));
end $$;
revoke all on function notify_me(text, text, text) from public, anon;
grant execute on function notify_me(text, text, text) to authenticated;
