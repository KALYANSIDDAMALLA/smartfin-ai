-- A personal PIN (4-6 digits) that must be entered to reveal an account balance, like payment apps.
-- The PIN is stored only as a salted bcrypt hash in a table that clients cannot read or write at all (RLS on, no policies, no grants);
-- everything goes through the SECURITY DEFINER functions below, which act only on auth.uid() and lock the PIN for 15 minutes after 5 wrong tries.
create table balance_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table balance_pins enable row level security;
revoke all on balance_pins from anon, authenticated;

create or replace function has_balance_pin() returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from balance_pins where user_id = auth.uid());
$$;

-- Returns 'ok' | 'wrong' | 'locked' | 'unset'. Wrong tries are counted here, so the limit holds however the function is called.
create or replace function check_balance_pin(p_pin text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare r balance_pins%rowtype; n int;
begin
  if auth.uid() is null then return 'unset'; end if;
  select * into r from balance_pins where user_id = auth.uid() for update;
  if not found then return 'unset'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if p_pin ~ '^[0-9]{4,6}$' and r.pin_hash = crypt(p_pin, r.pin_hash) then
    update balance_pins set failed_attempts = 0, locked_until = null where user_id = auth.uid();
    return 'ok';
  end if;
  n := r.failed_attempts + 1;
  if n >= 5 then
    update balance_pins set failed_attempts = 0, locked_until = now() + interval '15 minutes' where user_id = auth.uid();
    return 'locked';
  end if;
  update balance_pins set failed_attempts = n where user_id = auth.uid();
  return 'wrong';
end $$;

-- Sets a PIN. If one already exists the current PIN is required (and counted like any other try). Returns 'ok' | 'invalid' | 'wrong' | 'locked'.
create or replace function set_balance_pin(p_pin text, p_current text default null) returns text language plpgsql security definer set search_path = public, extensions as $$
declare existing boolean; chk text;
begin
  if auth.uid() is null then return 'invalid'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return 'invalid'; end if;
  select exists (select 1 from balance_pins where user_id = auth.uid()) into existing;
  if existing then
    chk := check_balance_pin(coalesce(p_current, ''));
    if chk <> 'ok' then return chk; end if;
  end if;
  insert into balance_pins (user_id, pin_hash) values (auth.uid(), crypt(p_pin, gen_salt('bf')))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return 'ok';
end $$;

revoke all on function has_balance_pin() from public, anon;
revoke all on function check_balance_pin(text) from public, anon;
revoke all on function set_balance_pin(text, text) from public, anon;
grant execute on function has_balance_pin() to authenticated;
grant execute on function check_balance_pin(text) to authenticated;
grant execute on function set_balance_pin(text, text) to authenticated;
