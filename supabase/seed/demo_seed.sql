-- ============================================================================================
-- SmartFin AI — DEMO DATA (development / demo only). NOT for real production use.
-- Creates two clearly fake users (@smartfin.demo) with example transactions, budgets, goals and recurring items.
-- Re-runnable: it first removes any previous demo users. Undo any time with demo_cleanup.sql.
--
-- SAFETY SWITCH: to run this, uncomment the next line (it is off by default so it can't be run by accident).
-- set smartfin.allow_demo = 'on';
--
-- Demo logins (password for both): Demo@12345
--   priya.demo@smartfin.demo   (salaried, 2 years of daily -> yearly activity)
--   arjun.demo@smartfin.demo   (student, 1 year of activity — shows each user only sees their own data)
-- ============================================================================================
do $$ begin
  if coalesce(current_setting('smartfin.allow_demo', true), '') <> 'on' then
    raise exception 'Demo seed is disabled. Uncomment the "set smartfin.allow_demo" line at the top of this file to run it.';
  end if;
end $$;

delete from auth.users where email like '%@smartfin.demo';

-- ---- users (profile, preferences, categories and payment methods come from the handle_new_user trigger) ----
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'priya.demo@smartfin.demo', crypt('Demo@12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Priya Sharma (demo)","first_name":"Priya","last_name":"Sharma"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'arjun.demo@smartfin.demo', crypt('Demo@12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Arjun Rao (demo)","first_name":"Arjun","last_name":"Rao"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%@smartfin.demo';

-- ---- helpers (temporary: they disappear at the end of the session) ----
-- Deterministic pseudo-random so every run produces the same demo data.
create or replace function pg_temp.r(seed text, n int) returns int language sql immutable as $$ select ((hashtext(seed)::bigint & 2147483647) % n)::int $$;
create or replace function pg_temp.pick(seed text, arr text[]) returns text language sql immutable as $$ select arr[1 + pg_temp.r(seed, array_length(arr, 1))] $$;

create or replace function pg_temp.tx(p_user uuid, p_type text, p_rupees numeric, p_days_ago int, p_name text, p_merchant text, p_cat text, p_method text,
                                      p_id uuid default null, p_refund_of uuid default null, p_hour int default 12)
returns uuid language plpgsql as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_kind text := case when p_type = 'income' then 'income' else 'expense' end;
        v_when timestamptz := date_trunc('day', now()) - make_interval(days => p_days_ago) + make_interval(hours => p_hour, mins => pg_temp.r(p_name || p_days_ago || p_rupees, 60));
begin
  insert into transactions (id, user_id, type, amount_minor, occurred_at, name, merchant, category_id, payment_method_id, refund_of_id, source, tags)
  values (v_id, p_user, p_type::tx_type, round(p_rupees * 100), least(v_when, now() - interval '5 minutes'), p_name, p_merchant,
    (select id from categories where user_id = p_user and name = p_cat and kind = v_kind),
    (select id from payment_methods where user_id = p_user and code = p_method), p_refund_of, 'manual', array['demo']);
  return v_id;
end $$;

-- ================= Priya Sharma (salaried) — 2 years, every day =================
do $$
declare
  u constant uuid := 'a0000000-0000-4000-8000-000000000001';
  d int; dt date; dow int; dom int; mon int; seed text; id1 uuid; amt numeric; bank uuid := gen_random_uuid(); card uuid := gen_random_uuid();
begin
  insert into accounts (id, user_id, name, kind, opening_balance_minor) values (bank, u, 'HDFC Savings', 'bank', 15000000), (card, u, 'ICICI Credit Card', 'credit_card', 0);
  for d in reverse 729..0 loop
    dt := current_date - d; dow := extract(dow from dt); dom := extract(day from dt); mon := extract(month from dt); seed := d::text;
    -- ---- every day: tea/snacks/lunch (daily view) ----
    if pg_temp.r('food'||seed, 100) < 72 then
      perform pg_temp.tx(u,'expense', 70 + pg_temp.r('fa'||seed, 300), d, pg_temp.pick('fn'||seed, array['Tea & snacks','Lunch','Coffee','Breakfast']),
        pg_temp.pick('fm'||seed, array['Swiggy','Zomato','Cafe Coffee Day','Office canteen','Local restaurant']), 'Food and groceries', pg_temp.pick('fp'||seed, array['upi','upi','gpay','phonepe','cash']), null, null, 9 + pg_temp.r('fh'||seed, 5));
    end if;
    -- ---- weekly: Sunday groceries; weekend dinners/entertainment; weekday commute ----
    if dow = 0 then perform pg_temp.tx(u,'expense', 1500 + pg_temp.r('g'||seed, 800), d, 'Weekly groceries', pg_temp.pick('gm'||seed, array['BigBasket','DMart','Reliance Fresh','Blinkit']), 'Food and groceries', pg_temp.pick('gp'||seed, array['upi','debit_card']), null, null, 11); end if;
    if dow in (5,6,0) and pg_temp.r('din'||seed, 100) < 28 then perform pg_temp.tx(u,'expense', 350 + pg_temp.r('da'||seed, 750), d, 'Dinner out', pg_temp.pick('dm'||seed, array['Barbeque Nation','Truffles','Meghana Foods','Pizza Hut']), 'Food and groceries', pg_temp.pick('dp'||seed, array['credit_card','upi']), null, null, 15); end if;
    if dow in (5,6) and pg_temp.r('ent'||seed, 100) < 22 then perform pg_temp.tx(u,'expense', 300 + pg_temp.r('ea'||seed, 800), d, pg_temp.pick('en'||seed, array['Movie tickets','Concert pass','Gaming','Bowling']), pg_temp.pick('em'||seed, array['PVR Cinemas','BookMyShow','Inox','Steam']), 'Entertainment', pg_temp.pick('ep'||seed, array['phonepe','upi','credit_card']), null, null, 14); end if;
    if dow between 1 and 5 and pg_temp.r('tr'||seed, 100) < 30 then perform pg_temp.tx(u,'expense', 120 + pg_temp.r('ta'||seed, 330), d, 'Cab ride', pg_temp.pick('tm'||seed, array['Uber','Ola','Rapido']), 'Transportation', pg_temp.pick('tp'||seed, array['gpay','upi']), null, null, 8); end if;
    if d % 12 = 5 then perform pg_temp.tx(u,'expense', 1200 + pg_temp.r('pe'||seed, 500), d, 'Petrol', pg_temp.pick('pm'||seed, array['HPCL','BPCL','Indian Oil']), 'Transportation', 'debit_card', null, null, 18); end if;
    -- ---- occasional: shopping (with some refunds), health, personal care, learning ----
    if pg_temp.r('shop'||seed, 100) < 7 then
      amt := 300 + pg_temp.r('sa'||seed, 2000);
      id1 := pg_temp.tx(u,'expense', amt, d, pg_temp.pick('sn'||seed, array['Clothes','Headphones','Home decor','Shoes','Books','Gadget accessory']), pg_temp.pick('sm'||seed, array['Amazon','Flipkart','Myntra','Ajio','Nykaa']), 'Shopping', pg_temp.pick('sp'||seed, array['credit_card','credit_card','upi']), null, null, 20);
      if pg_temp.r('ref'||seed, 8) = 0 and d >= 5 then perform pg_temp.tx(u,'refund', round(amt * (30 + pg_temp.r('rr'||seed, 31)) / 100.0), d - 5, 'Return refund', null, 'Shopping', 'credit_card', null, id1, 12); end if;
    end if;
    if pg_temp.r('hl'||seed, 100) < 3 then perform pg_temp.tx(u,'expense', 200 + pg_temp.r('ha'||seed, 1600), d, pg_temp.pick('hn'||seed, array['Medicines','Doctor consultation','Lab test']), pg_temp.pick('hm'||seed, array['Apollo Pharmacy','MedPlus','Practo','Local clinic']), 'Healthcare', pg_temp.pick('hp'||seed, array['cash','upi']), null, null, 10); end if;
    if pg_temp.r('pc'||seed, 100) < 5 then perform pg_temp.tx(u,'expense', 300 + pg_temp.r('pa'||seed, 900), d, pg_temp.pick('pn'||seed, array['Salon','Spa','Haircut']), 'Urban Company', 'Personal', 'upi', null, null, 17); end if;
    if pg_temp.r('edu'||seed, 1000) < 12 then perform pg_temp.tx(u,'expense', 449 + pg_temp.r('ua'||seed, 850), d, 'Online course', pg_temp.pick('um'||seed, array['Udemy','Coursera']), 'Education', 'credit_card', null, null, 21); end if;
    -- ---- trips: flight + hotel every ~75 days ----
    if d % 110 = 40 then perform pg_temp.tx(u,'expense', 5500 + pg_temp.r('fl'||seed, 4000), d, 'Flight tickets', pg_temp.pick('fm2'||seed, array['MakeMyTrip','IndiGo','Air India']), 'Travel', 'credit_card', null, null, 7);
                       perform pg_temp.tx(u,'expense', 3000 + pg_temp.r('ho'||seed, 3000), greatest(d - 1, 0), 'Hotel stay', pg_temp.pick('hm2'||seed, array['OYO','Airbnb','Treebo']), 'Travel', 'upi', null, null, 13); end if;

    -- ---- monthly (monthly view) ----
    if dom = 1 then perform pg_temp.tx(u,'income', case when d > 365 then 75000 else 85000 end, d, to_char(dt,'FMMonth') || ' salary', 'Acme Technologies', 'Salary', 'net_banking', null, null, 9); end if;
    if dom = 2 then perform pg_temp.tx(u,'expense', case when d > 365 then 20000 else 22000 end, d, 'House rent', 'Landlord', 'Rent', 'net_banking', null, null, 10); end if;
    if dom = 3 and d < 540 then perform pg_temp.tx(u,'expense', 6500, d, 'Home loan EMI', 'HDFC Bank', 'Loan payments', 'net_banking', null, null, 8); end if;
    if dom = 5 then perform pg_temp.tx(u,'expense', 1049, d, 'Broadband', 'ACT Fibernet', 'Utilities', 'upi', null, null, 11); end if;
    if dom = 7 then perform pg_temp.tx(u,'expense', 649, d, 'Netflix', 'Netflix', 'Subscriptions', 'credit_card', null, null, 6); end if;
    if dom = 8 then perform pg_temp.tx(u,'expense', case when d > 365 then 599 else 719 end, d, 'Mobile recharge', 'Airtel', 'Utilities', 'upi', null, null, 12); end if;
    if dom = 9 then perform pg_temp.tx(u,'expense', 1300 + pg_temp.r('el'||seed, 1100), d, 'Electricity bill', 'BESCOM', 'Utilities', 'net_banking', null, null, 11); end if;
    if dom = 10 then perform pg_temp.tx(u,'expense', 119, d, 'Spotify', 'Spotify', 'Subscriptions', 'credit_card', null, null, 6); end if;
    if dom = 14 and d < 430 then perform pg_temp.tx(u,'expense', 1500, d, 'Gym membership', 'Cult.fit', 'Personal', 'upi', null, null, 7); end if;
    if dom = 20 then perform pg_temp.tx(u,'expense', 0.01, d, 'placeholder', null, 'Other', 'upi', null, null, 1); delete from transactions where user_id = u and name = 'placeholder'; -- credit-card bill is a TRANSFER, not a second expense
      insert into transactions (user_id, type, amount_minor, occurred_at, name, from_account_id, to_account_id, source, tags)
      values (u, 'transfer', (12000 + pg_temp.r('cc'||seed, 16000)) * 100, least(date_trunc('day', now()) - make_interval(days => d) + interval '10 hours', now() - interval '5 minutes'), 'Credit card bill payment', bank, card, 'manual', array['demo']); end if;
    -- ---- quarterly / half-yearly / yearly (yearly view) ----
    if dom = 28 and mon in (3,6,9,12) then perform pg_temp.tx(u,'income', 600 + pg_temp.r('in'||seed, 700), d, 'Savings interest', 'HDFC Bank', 'Interest', 'net_banking', null, null, 9); end if;
    if dom = 18 and mon % 2 = 0 then perform pg_temp.tx(u,'income', 8000 + pg_temp.r('fr'||seed, 7000), d, 'Freelance project', pg_temp.pick('fc'||seed, array['Local client','Startup client','Agency']), 'Freelance', 'upi', null, null, 15); end if;
    if dom = 12 and mon = 5 then perform pg_temp.tx(u,'income', 2400, d, 'Dividend', 'Mutual fund', 'Investment', 'net_banking', null, null, 10); end if;
    if dom = 5 and mon = 11 then perform pg_temp.tx(u,'income', 40000, d, 'Diwali bonus', 'Acme Technologies', 'Salary', 'net_banking', null, null, 9); end if;
    if dom = 5 and mon = 8 then perform pg_temp.tx(u,'income', 14500, d, 'Income tax refund', 'Income Tax Dept', 'Other', 'net_banking', null, null, 11); end if;
    if dom = 10 and mon = 3 then perform pg_temp.tx(u,'expense', 18000, d, 'Health insurance premium', 'Star Health', 'Insurance', 'net_banking', null, null, 10); end if;
    if dom = 18 and mon = 7 then perform pg_temp.tx(u,'expense', 1499, d, 'Amazon Prime (yearly)', 'Amazon', 'Subscriptions', 'credit_card', null, null, 8); end if;
  end loop;

  -- ---- budgets: daily, weekly, monthly, yearly + category/channel ----
  insert into budgets (user_id, name, period, amount_minor, category_id, channel) values
    (u,'Daily spending cap','daily', 150000, null, null),
    (u,'Dining out','weekly', 300000, (select id from categories where user_id=u and name='Food and groceries' and kind='expense'), null),
    (u,'Groceries & dining','monthly', 1200000, (select id from categories where user_id=u and name='Food and groceries' and kind='expense'), null),
    (u,'Entertainment','monthly', 300000, (select id from categories where user_id=u and name='Entertainment' and kind='expense'), null),
    (u,'Shopping','monthly', 400000, (select id from categories where user_id=u and name='Shopping' and kind='expense'), null),
    (u,'Online payments','monthly', 5000000, null, 'online'),
    (u,'Cash spending','monthly', 500000, null, 'offline'),
    (u,'Travel (yearly)','yearly', 6000000, (select id from categories where user_id=u and name='Travel' and kind='expense'), null);
  -- ---- goals with a year of contributions ----
  with g as (insert into financial_goals (user_id, name, kind, description, target_minor, target_date, contribution_frequency, status)
    values (u,'Emergency fund','emergency_fund','6 months of expenses', 30000000, current_date + 365, 'monthly','active'),
           (u,'Goa trip','travel','Holiday with friends', 4000000, current_date + 150, 'monthly','active'),
           (u,'New laptop','custom','Completed last quarter', 9000000, current_date - 60, 'monthly','completed'),
           (u,'Bike down payment','vehicle','Paused until bonus', 15000000, current_date + 400, 'monthly','paused') returning id, name)
  insert into goal_contributions (user_id, goal_id, amount_minor, contributed_on, note)
  select u, g.id, case g.name when 'Emergency fund' then 1000000 when 'Goa trip' then 500000 when 'New laptop' then 1500000 else 300000 end,
         current_date - (m * 30 + 2), case when m = 0 then 'Latest' else 'Monthly' end
  from g join generate_series(0, 11) m on (g.name = 'Emergency fund') or (g.name = 'Goa trip' and m < 6) or (g.name = 'New laptop' and m between 3 and 8) or (g.name = 'Bike down payment' and m between 8 and 10);
  insert into goal_contributions (user_id, goal_id, amount_minor, contributed_on, note)
    select u, id, -500000, current_date - 20, 'Withdrawal for a medical bill' from financial_goals where user_id = u and name = 'Emergency fund';
  -- ---- recurring ----
  insert into recurring_rules (user_id, name, tx_type, estimated_amount_minor, category_id, payment_method_id, frequency, next_due_date, paused)
  select u, v.n, v.t::tx_type, v.a, (select id from categories where user_id=u and name=v.c and kind=case when v.t='income' then 'income' else 'expense' end), (select id from payment_methods where user_id=u and code=v.m), v.f, current_date + v.due, v.paused
  from (values ('House rent','expense',2200000,'Rent','net_banking','monthly',27,false),('Netflix','expense',64900,'Subscriptions','credit_card','monthly',6,false),
               ('Salary','income',8500000,'Salary','net_banking','monthly',28,false),('Home loan EMI','expense',650000,'Loan payments','net_banking','monthly',2,false),
               ('Broadband','expense',104900,'Utilities','upi','monthly',4,false),('Electricity bill','expense',180000,'Utilities','net_banking','monthly',8,false),
               ('Health insurance','expense',1800000,'Insurance','net_banking','yearly',130,false),('Gym membership','expense',150000,'Personal','upi','monthly',13,true)) v(n,t,a,c,m,f,due,paused);
  insert into savings_plans (user_id, monthly_income_minor, essential_minor, discretionary_minor, commitments_minor, current_savings_minor) values (u, 8500000, 4800000, 1500000, 650000, 2200000);
  insert into notifications (user_id, kind, title, body, created_at) values
    (u,'budget','Budget "Groceries & dining" reached 75%','You have used 75% of this monthly budget.', now() - interval '2 days'),
    (u,'budget','Budget "Shopping" reached 100%','You have used 100% of this monthly budget.', now() - interval '6 days'),
    (u,'goal','Emergency fund: 25% reached','Nice progress — keep it going.', now() - interval '12 days'),
    (u,'goal','New laptop completed','You reached your goal. Congratulations!', now() - interval '60 days'),
    (u,'summary','Your weekly summary is ready','Spending was lower than last week.', now() - interval '1 day'),
    (u,'import','Import complete','34 transactions added, 2 duplicates skipped.', now() - interval '30 days');
end $$;

-- ================= Arjun Rao (student) — 1 year, every day =================
do $$
declare u constant uuid := 'a0000000-0000-4000-8000-000000000002'; d int; dt date; dow int; dom int; mon int; seed text;
begin
  for d in reverse 364..0 loop
    dt := current_date - d; dow := extract(dow from dt); dom := extract(day from dt); mon := extract(month from dt); seed := 'a' || d::text;
    if pg_temp.r('c'||seed, 100) < 85 then perform pg_temp.tx(u,'expense', 30 + pg_temp.r('ca'||seed, 150), d, pg_temp.pick('cn'||seed, array['Chai & snacks','Canteen lunch','Juice','Samosa']), pg_temp.pick('cm'||seed, array['Canteen','Tea stall','Juice centre']), 'Food and groceries', pg_temp.pick('cp'||seed, array['cash','cash','upi']), null, null, 10 + pg_temp.r('ch'||seed, 6)); end if;
    if dow between 1 and 5 and pg_temp.r('b'||seed, 100) < 25 then perform pg_temp.tx(u,'expense', 20 + pg_temp.r('ba'||seed, 100), d, 'Bus / auto', 'Local transport', 'Transportation', 'cash', null, null, 8); end if;
    if dow = 6 and pg_temp.r('mv'||seed, 100) < 20 then perform pg_temp.tx(u,'expense', 250 + pg_temp.r('ma'||seed, 200), d, 'Movie', 'PVR Cinemas', 'Entertainment', 'gpay', null, null, 18); end if;
    if pg_temp.r('sh'||seed, 100) < 4 then perform pg_temp.tx(u,'expense', 300 + pg_temp.r('sa'||seed, 2200), d, pg_temp.pick('sn'||seed, array['Headset','Backpack','T-shirt','Phone cover']), pg_temp.pick('sm'||seed, array['Flipkart','Amazon','Myntra']), 'Shopping', 'upi', null, null, 20); end if;
    if pg_temp.r('hl'||seed, 100) < 2 then perform pg_temp.tx(u,'expense', 100 + pg_temp.r('ha'||seed, 500), d, 'Medicines', 'Campus pharmacy', 'Healthcare', 'cash', null, null, 12); end if;
    if pg_temp.r('co'||seed, 1000) < 10 then perform pg_temp.tx(u,'expense', 399 + pg_temp.r('ua'||seed, 900), d, 'Coding course', 'Udemy', 'Education', 'upi', null, null, 21); end if;
    if d % 21 = 6 then perform pg_temp.tx(u,'income', 1500 + pg_temp.r('tu'||seed, 2000), d, 'Tuition (part-time)', 'Student', 'Freelance', 'upi', null, null, 17); end if;
    if dom = 3 then perform pg_temp.tx(u,'expense', 3500, d, 'Hostel mess', 'Hostel', 'Food and groceries', 'upi', null, null, 9); end if;
    if dom = 4 then perform pg_temp.tx(u,'income', case when d > 180 then 8000 else 10000 end, d, 'Monthly allowance', 'Parents', 'Gift', 'upi', null, null, 9); end if;
    if dom = 6 then perform pg_temp.tx(u,'expense', 300 + pg_temp.r('mc'||seed, 200), d, 'Metro card recharge', 'Namma Metro', 'Transportation', 'phonepe', null, null, 8); end if;
    if dom = 10 then perform pg_temp.tx(u,'expense', 239, d, 'Mobile recharge', 'Jio', 'Utilities', 'upi', null, null, 12); end if;
    if dom = 15 then perform pg_temp.tx(u,'expense', 119, d, 'Spotify student', 'Spotify', 'Subscriptions', 'upi', null, null, 6); end if;
    if dom = 15 and mon in (1,4,7,10) then perform pg_temp.tx(u,'income', 5000, d, 'Scholarship instalment', 'University', 'Other', 'net_banking', null, null, 11); end if;
    if dom = 10 and mon in (1,8) then perform pg_temp.tx(u,'expense', 2500, d, 'Semester books', 'Campus bookstore', 'Education', 'cash', null, null, 14); end if;
    if dom = 1 and mon = 6 then perform pg_temp.tx(u,'expense', 18000, d, 'Annual college fee', 'University', 'Education', 'net_banking', null, null, 10); end if;
    if dom = 20 and mon in (5,12) then perform pg_temp.tx(u,'expense', 700, d, 'Train tickets home', 'IRCTC', 'Travel', 'upi', null, null, 7); perform pg_temp.tx(u,'expense', 700, greatest(d - 10, 0), 'Train tickets back', 'IRCTC', 'Travel', 'upi', null, null, 7); end if;
    if dom = 5 and mon = 11 then perform pg_temp.tx(u,'income', 2000, d, 'Diwali gift', 'Family', 'Gift', 'upi', null, null, 10); end if;
  end loop;
  insert into budgets (user_id, name, period, amount_minor, category_id) values
    (u,'Daily pocket money','daily', 30000, null), (u,'Weekly eating out','weekly', 120000, (select id from categories where user_id=u and name='Food and groceries' and kind='expense')),
    (u,'Food','monthly', 400000, (select id from categories where user_id=u and name='Food and groceries' and kind='expense')), (u,'Learning (yearly)','yearly', 4000000, (select id from categories where user_id=u and name='Education' and kind='expense'));
  with g as (insert into financial_goals (user_id, name, kind, target_minor, target_date, contribution_frequency, status)
    values (u,'New laptop','custom', 4500000, current_date + 240, 'monthly','active'), (u,'Europe trip','travel', 20000000, current_date + 700, 'yearly','paused') returning id, name)
  insert into goal_contributions (user_id, goal_id, amount_minor, contributed_on, note)
    select u, g.id, case g.name when 'New laptop' then 150000 else 100000 end, current_date - (m * 30 + 5), 'Saved from allowance' from g join generate_series(0, 8) m on (g.name = 'New laptop') or (g.name = 'Europe trip' and m < 3);
  insert into recurring_rules (user_id, name, tx_type, estimated_amount_minor, category_id, payment_method_id, frequency, next_due_date)
  select u, v.n, v.t::tx_type, v.a, (select id from categories where user_id=u and name=v.c and kind=case when v.t='income' then 'income' else 'expense' end), (select id from payment_methods where user_id=u and code=v.m), v.f, current_date + v.due
  from (values ('Hostel mess','expense',350000,'Food and groceries','upi','monthly',20),('Monthly allowance','income',1000000,'Gift','upi','monthly',3),('Spotify student','expense',11900,'Subscriptions','upi','monthly',14)) v(n,t,a,c,m,f,due);
  insert into notifications (user_id, kind, title, body, created_at) values
    (u,'budget','Budget "Food" reached 90%','You have used 90% of this monthly budget.', now() - interval '3 days'),
    (u,'goal','New laptop: 50% reached','Halfway there!', now() - interval '25 days');
end $$;

-- ================= Feature showcase extras (every screen has something to show) =================
do $$
declare
  p constant uuid := 'a0000000-0000-4000-8000-000000000001'; a constant uuid := 'a0000000-0000-4000-8000-000000000002';
  b_ok uuid := gen_random_uuid(); b_prev uuid := gen_random_uuid(); b_fail uuid := gen_random_uuid(); conv uuid := gen_random_uuid();
  ms timestamptz := date_trunc('month', now()) - interval '1 month'; me timestamptz := date_trunc('month', now());
  inc bigint; spent bigint; prev_spent bigint; topname text; topval bigint; fmt text := 'FM99,99,99,990';
begin
  -- Today & yesterday: so Today / This week / This month views are never empty
  perform pg_temp.tx(p,'expense', 140,0,'Morning coffee','Third Wave Coffee','Food and groceries','upi', null, null, 8);
  perform pg_temp.tx(p,'expense', 285,0,'Cab to office','Uber','Transportation','gpay', null, null, 9);
  perform pg_temp.tx(p,'expense', 460,0,'Team lunch','Zomato','Food and groceries','credit_card', null, null, 12);
  perform pg_temp.tx(p,'income', 9000,0,'Freelance — logo design','Local client','Freelance','upi', null, null, 11);
  perform pg_temp.tx(p,'expense', 799,1,'Wireless mouse','Amazon','Shopping','credit_card', null, null, 19);
  perform pg_temp.tx(a,'expense', 60,0,'Canteen lunch','Canteen','Food and groceries','cash', null, null, 12);
  perform pg_temp.tx(a,'expense', 45,0,'Chai','Tea stall','Food and groceries','upi', null, null, 10);
  perform pg_temp.tx(a,'income', 2500,0,'Tuition (part-time)','Student','Freelance','upi', null, null, 11);
  -- Unusual spending (AI "worth reviewing") + big-ticket items
  perform pg_temp.tx(p,'expense', 14999,2,'Monitor & desk setup','Amazon','Shopping','credit_card', null, null, 20);
  perform pg_temp.tx(p,'expense',  9800,9,'Dental treatment','Smile Dental Clinic','Healthcare','cash', null, null, 15);
  perform pg_temp.tx(a,'expense',  8999,14,'Laptop repair','Service centre','Other','upi', null, null, 16);
  -- Uncategorised entries (shows the "—" state and auto-categorise suggestions), a manual adjustment, and a soft-deleted entry (excluded from totals)
  insert into transactions (user_id, type, amount_minor, occurred_at, name, merchant, payment_method_id, source, tags)
  select p, 'expense', v.amt * 100, now() - make_interval(days => v.d), v.n, v.m, (select id from payment_methods where user_id=p and code='upi'), 'manual', array['demo','needs-category']
  from (values (320,4,'Misc spend','Corner shop'),(180,11,'Misc spend','Street vendor'),(650,19,'Gift for colleague','Gift shop')) v(amt,d,n,m);
  insert into transactions (user_id, type, amount_minor, occurred_at, name, direction, source, notes, tags) values
    (p,'adjustment', 50000, now() - interval '15 days', 'Cash balance correction', 'out', 'manual', 'Reconciled wallet with actual cash in hand', array['demo','adjustment']);
  insert into transactions (user_id, type, amount_minor, occurred_at, name, merchant, source, deleted_at, notes, tags) values
    (p,'expense', 1200000, now() - interval '3 days', 'Duplicate entry (deleted)', 'Amazon', 'manual', now() - interval '2 days', 'Entered twice by mistake — soft-deleted; excluded from every total', array['demo']);
  -- Rich details on selected rows: notes, descriptions, tags, UPI references
  update transactions set notes = 'Paid on the 2nd via net banking; receipt emailed by landlord', description = 'Monthly rent for 2BHK, Indiranagar', tags = tags || array['fixed','housing'] where id = (select id from transactions where user_id=p and name='House rent' order by occurred_at desc limit 1);
  update transactions set external_ref = 'UPI-3' || lpad((row_number)::text, 11, '0'), tags = tags || array['upi'] from (select id, row_number() over (order by occurred_at desc) from transactions where user_id=p and payment_method_id=(select id from payment_methods where user_id=p and code='upi') limit 12) x where transactions.id = x.id;
  update transactions set tags = tags || array['work'], description = 'Reimbursable by employer' where user_id=p and name in ('Cab to office','Team lunch') and occurred_at > now() - interval '3 days';

  -- Import centre: a confirmed batch (with imported rows), a statement waiting for review (duplicate + low-confidence rows), and a failed upload
  insert into import_batches (id, user_id, file_name, file_kind, storage_path, size_bytes, status, confirmed_at, created_at) values
    (b_ok,  p, 'HDFC_October_statement.csv', 'csv', 'removed', 18234, 'confirmed', now() - interval '30 days', now() - interval '30 days'),
    (b_prev, p, 'ICICI_November_statement.xlsx', 'xlsx', 'demo/placeholder', 48213, 'preview', null, now() - interval '1 hour'),
    (b_fail, p, 'scanned_receipt.pdf', 'pdf', 'removed', 912340, 'failed', null, now() - interval '9 days');
  update import_batches set error = 'No transactions could be found in this file.' where id = b_fail;
  insert into transactions (user_id, type, amount_minor, occurred_at, name, merchant, category_id, payment_method_id, source, external_ref, import_batch_id, tags)
  select p, 'expense', v.amt * 100, now() - make_interval(days => v.d), v.n, v.m, (select id from categories where user_id=p and name=v.c and kind='expense'), (select id from payment_methods where user_id=p and code='upi'), 'import_csv', v.ref, b_ok, array['demo','imported']
  from (values (540,33,'Swiggy order','Swiggy','Food and groceries','HDFC-90001'),(1250,34,'Big Basket','BigBasket','Food and groceries','HDFC-90002'),(330,35,'Uber ride','Uber','Transportation','HDFC-90003'),
               (899,36,'Spotify + Prime','Amazon','Subscriptions','HDFC-90004'),(2100,38,'Pharmacy','Apollo Pharmacy','Healthcare','HDFC-90005')) v(amt,d,n,m,c,ref);
  insert into transactions (user_id, type, amount_minor, occurred_at, name, merchant, category_id, payment_method_id, source, external_ref, tags) values
    (p,'expense', 42000, now() - interval '3 days', 'Dinner', 'Truffles', (select id from categories where user_id=p and name='Food and groceries' and kind='expense'), (select id from payment_methods where user_id=p and code='upi'), 'manual', 'ICICI-2001', array['demo']);
  insert into staged_import_transactions (user_id, batch_id, row_index, raw, amount_minor, occurred_at, merchant, description, tx_type, category_id, external_ref, confidence, is_duplicate, duplicate_reason, include) values
    (p,b_prev,0,'{"Date":"01/11/2026","Description":"UPI-SWIGGY-FOOD","Withdrawal":"420.00","Deposit":"","Ref":"ICICI-2101"}', 42000, now() - interval '1 day', 'UPI-SWIGGY-FOOD','UPI-SWIGGY-FOOD','expense',(select id from categories where user_id=p and name='Food and groceries' and kind='expense'),'ICICI-2101',1.00,false,null,true),
    (p,b_prev,1,'{"Date":"31/10/2026","Description":"AMAZON PAY INDIA","Withdrawal":"1299.00","Deposit":"","Ref":"ICICI-2102"}', 129900, now() - interval '2 days', 'AMAZON PAY INDIA','AMAZON PAY INDIA','expense',(select id from categories where user_id=p and name='Shopping' and kind='expense'),'ICICI-2102',1.00,false,null,true),
    (p,b_prev,2,'{"Date":"30/10/2026","Description":"NEFT-ACME TECH-SALARY","Withdrawal":"","Deposit":"85000.00","Ref":"ICICI-2103"}', 8500000, now() - interval '3 days', 'ACME TECH','NEFT-ACME TECH-SALARY','income',(select id from categories where user_id=p and name='Salary' and kind='income'),'ICICI-2103',1.00,false,null,true),
    (p,b_prev,3,'{"Date":"29/10/2026","Description":"UPI-TRUFFLES","Withdrawal":"420.00","Deposit":"","Ref":"ICICI-2001"}', 42000, now() - interval '3 days', 'UPI-TRUFFLES','UPI-TRUFFLES','expense',null,'ICICI-2001',1.00,true,'external_ref',false),
    (p,b_prev,4,'{"Date":"??","Description":"POS 4821 UNKNOWN MERCHANT","Withdrawal":"760.00","Deposit":"","Ref":""}', 76000, null, 'POS 4821 UNKNOWN MERCHANT','POS 4821 UNKNOWN MERCHANT','expense',null,null,0.55,false,null,false),
    (p,b_prev,5,'{"Date":"27/10/2026","Description":"ATM WDL BLR","Withdrawal":"2000.00","Deposit":"","Ref":"ICICI-2105"}', 200000, now() - interval '5 days', 'ATM WDL BLR','ATM WDL BLR','expense',null,'ICICI-2105',0.80,false,null,true);

  -- Saved AI analysis + assistant chat, built from the REAL numbers above (nothing invented)
  select coalesce(sum(amount_minor) filter (where type='income'),0), coalesce(sum(case when type='expense' then amount_minor when type='refund' then -amount_minor else 0 end),0)
    into inc, spent from transactions where user_id=p and deleted_at is null and occurred_at >= ms and occurred_at < me;
  select coalesce(sum(case when type='expense' then amount_minor when type='refund' then -amount_minor else 0 end),0) into prev_spent
    from transactions where user_id=p and deleted_at is null and occurred_at >= ms - interval '1 month' and occurred_at < ms;
  select c.name, sum(case when t.type='expense' then t.amount_minor else -t.amount_minor end) into topname, topval
    from transactions t join categories c on c.id=t.category_id and c.user_id=t.user_id where t.user_id=p and t.type in ('expense','refund') and t.deleted_at is null and t.occurred_at >= ms and t.occurred_at < me group by c.name order by 2 desc limit 1;
  insert into ai_insights (user_id, period_start, period_end, metrics, insights, model, is_fallback) values (p, ms::date, (me - interval '1 day')::date,
    jsonb_build_object('current', jsonb_build_object('incomeMinor', inc, 'netExpenseMinor', spent, 'netCashFlowMinor', inc - spent), 'previous', jsonb_build_object('netExpenseMinor', prev_spent), 'topCategories', jsonb_build_array(jsonb_build_object('name', topname, 'minor', topval))),
    jsonb_build_object('summary', format('For %s to %s (built-in analysis of your ledger).', ms::date, (me - interval '1 day')::date),
      'highlights', jsonb_build_array(format('Income ₹%s, net expenses ₹%s, net cash flow ₹%s.', to_char(inc/100, fmt), to_char(spent/100, fmt), to_char((inc-spent)/100, fmt)),
                                      format('Highest category: %s at ₹%s.', topname, to_char(topval/100, fmt)),
                                      format('Net spending was %s%% %s the previous month.', abs(round((spent - prev_spent) * 100.0 / nullif(prev_spent,0))), case when spent >= prev_spent then 'above' else 'below' end)),
      'recommendations', jsonb_build_array('Set a monthly cap for your highest category and review it weekly.', 'Move part of the surplus to your Emergency fund goal right after salary day.'),
      'review', jsonb_build_array('₹14,999 Shopping (Monitor & desk setup) is well above your typical purchase — worth a look.', '₹9,800 Healthcare (Dental treatment) is well above your typical amount — worth a look.')),
    null, true);
  insert into ai_conversations (id, user_id, title) values (conv, p, 'How much did I spend last month?');
  insert into ai_messages (user_id, conversation_id, role, content, created_at) values
    (p, conv, 'user', 'How much did I spend last month?', now() - interval '2 hours'),
    (p, conv, 'assistant', format(E'You spent ₹%s (net of refunds) in %s to %s.\n\n(Period: %s to %s)', to_char(spent/100, fmt), ms::date, (me - interval '1 day')::date, ms::date, (me - interval '1 day')::date), now() - interval '2 hours'),
    (p, conv, 'user', 'What recurring payments do I have?', now() - interval '1 hour'),
    (p, conv, 'assistant', (select 'Your recurring items:' || E'\n' || string_agg(format('• %s — ₹%s %s, next %s', name, to_char(estimated_amount_minor/100, fmt), frequency, next_due_date), E'\n' order by next_due_date) from recurring_rules where user_id=p and not paused), now() - interval '1 hour');

  -- Notifications: a mix of unread and read, across every kind
  update notifications set read_at = created_at + interval '1 hour' where user_id = p and created_at < now() - interval '10 days';
  update notifications set read_at = created_at + interval '1 hour' where user_id = a and created_at < now() - interval '20 days';
  insert into notifications (user_id, kind, title, body, created_at) values
    (p,'unusual','Unusual spending to review','₹14,999 at Amazon is higher than your usual Shopping purchases. This is a prompt to review, not a finding of fraud.', now() - interval '2 days'),
    (p,'recurring','Upcoming: Home loan EMI','₹6,500 due in 2 days.', now() - interval '5 hours'),
    (p,'import','ICICI statement ready to review','6 rows found — 1 possible duplicate, 1 needs fixing.', now() - interval '1 hour'),
    (p,'ai','New AI analysis available','Your last-month analysis is ready.', now() - interval '3 hours'),
    (a,'recurring','Upcoming: Hostel mess','₹3,500 due soon.', now() - interval '1 day'),
    (a,'unusual','Unusual spending to review','₹8,999 (Laptop repair) is higher than your usual spending.', now() - interval '14 days');
end $$;

select 'Demo data created. Log in with priya.demo@smartfin.demo or arjun.demo@smartfin.demo, password Demo@12345' as result;
