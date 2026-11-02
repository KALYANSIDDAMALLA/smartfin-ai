-- ============================================================================================
-- SmartFin AI — DEMO DATA, BUSINESS OWNER (development / demo only). NOT for real production use.
-- Adds ONE clearly fake user: rohan.demo@smartfin.demo (retail & wholesale shop owner), ~4,500 transactions over 2 years.
-- Re-runnable and independent: it only removes/recreates Rohan, so Priya and Arjun are untouched.
-- (demo_seed.sql deletes every @smartfin.demo user, so if you re-run that one, run this one afterwards.)
--
-- SAFETY SWITCH: to run this, uncomment the next line.
-- set smartfin.allow_demo = 'on';
--
-- Login: rohan.demo@smartfin.demo   password: Demo@12345
-- ============================================================================================
do $$ begin
  if coalesce(current_setting('smartfin.allow_demo', true), '') <> 'on' then
    raise exception 'Demo seed is disabled. Uncomment the "set smartfin.allow_demo" line at the top of this file to run it.';
  end if;
end $$;

delete from auth.users where email = 'rohan.demo@smartfin.demo';

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rohan.demo@smartfin.demo', crypt('Demo@12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Rohan Mehta (demo)","first_name":"Rohan","last_name":"Mehta"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email = 'rohan.demo@smartfin.demo';

-- ---- helpers (temporary) ----
create or replace function pg_temp.r(seed text, n int) returns int language sql immutable as $$ select ((hashtext(seed)::bigint & 2147483647) % n)::int $$;
create or replace function pg_temp.pick(seed text, arr text[]) returns text language sql immutable as $$ select arr[1 + pg_temp.r(seed, array_length(arr, 1))] $$;
create or replace function pg_temp.tx(p_user uuid, p_type text, p_rupees numeric, p_days_ago int, p_name text, p_merchant text, p_cat text, p_method text,
                                      p_id uuid default null, p_refund_of uuid default null, p_hour int default 12)
returns uuid language plpgsql as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_kind text := case when p_type = 'income' then 'income' else 'expense' end;
        v_when timestamptz := date_trunc('day', now()) - make_interval(days => p_days_ago) + make_interval(hours => p_hour, mins => pg_temp.r(p_name || p_days_ago || p_rupees || coalesce(p_merchant,''), 60));
begin
  insert into transactions (id, user_id, type, amount_minor, occurred_at, name, merchant, category_id, payment_method_id, refund_of_id, source, tags)
  values (v_id, p_user, p_type::tx_type, round(p_rupees * 100), least(v_when, now() - interval '5 minutes'), p_name, p_merchant,
    (select id from categories where user_id = p_user and name = p_cat and kind = v_kind),
    (select id from payment_methods where user_id = p_user and code = p_method), p_refund_of, 'manual', array['demo','business']);
  return v_id;
end $$;

do $$
declare
  u constant uuid := 'a0000000-0000-4000-8000-000000000003';
  cur uuid := gen_random_uuid(); drawer uuid := gen_random_uuid(); own uuid := gen_random_uuid();
  d int; dt date; dow int; dom int; mon int; seed text; n int; i int; amt numeric; id1 uuid; fest boolean;
begin
  -- Business-specific categories on top of the defaults
  insert into categories (user_id, name, kind) values
    (u,'Inventory & stock','expense'),(u,'Staff salaries','expense'),(u,'GST & taxes','expense'),
    (u,'Marketing & ads','expense'),(u,'Packaging & courier','expense'),(u,'Professional fees','expense');

  insert into accounts (id, user_id, name, kind, opening_balance_minor) values
    (cur,    u, 'Business Current Account (ICICI)', 'bank', 50000000),
    (drawer, u, 'Shop cash drawer',                 'cash',  3000000),
    (own,    u, 'Owner personal savings (SBI)',     'bank', 20000000);

  for d in reverse 729..0 loop
    dt := current_date - d; dow := extract(dow from dt); dom := extract(day from dt); mon := extract(month from dt); seed := 'r' || d::text;
    fest := mon in (10, 11);   -- festive season: busier shop

    -- ---- DAILY: counter sales (several per day), staff tea, courier ----
    n := case when dow = 0 then 4 else 6 end + pg_temp.r('n'||seed, 4) + case when fest then 3 else 0 end;
    for i in 1..n loop
      perform pg_temp.tx(u,'income', 120 + pg_temp.r('sa'||seed||i, 2300), d,
        pg_temp.pick('sn'||seed||i, array['Counter sale','Counter sale','Counter sale','Retail bill','Walk-in customer','Phone order pickup']),
        pg_temp.pick('sc'||seed||i, array['Walk-in customer','Walk-in customer','Regular customer','Local household','Neighbourhood shop']),
        'Business', pg_temp.pick('sp'||seed||i, array['upi','upi','gpay','phonepe','paytm','cash','cash','debit_card','credit_card']), null, null, 10 + pg_temp.r('sh'||seed||i, 11));
    end loop;
    if pg_temp.r('tea'||seed, 100) < 75 then perform pg_temp.tx(u,'expense', 60 + pg_temp.r('ta'||seed, 190), d, 'Staff tea & snacks', 'Tea stall', 'Food and groceries', 'cash', null, null, 16); end if;
    if pg_temp.r('cr'||seed, 100) < 38 then perform pg_temp.tx(u,'expense', 120 + pg_temp.r('ca'||seed, 530), d, pg_temp.pick('cn'||seed, array['Courier charges','Packaging material','Delivery charges']), pg_temp.pick('cm'||seed, array['Delhivery','DTDC','India Post','Local packaging store']), 'Packaging & courier', pg_temp.pick('cp'||seed, array['upi','cash']), null, null, 17); end if;

    -- ---- WEEKLY: stock purchases (with some supplier credit notes), wholesale/B2B orders, marketplace payouts, cash deposit ----
    if dow in (1, 4) then
      amt := 20000 + pg_temp.r('iv'||seed, 16000);
      id1 := pg_temp.tx(u,'expense', amt, d, 'Stock purchase', pg_temp.pick('im'||seed, array['Sharma Wholesale','Gupta Traders','Metro Cash & Carry','Balaji Distributors','Om Enterprises']), 'Inventory & stock', pg_temp.pick('ip'||seed, array['neft','rtgs','net_banking','imps','upi']), null, null, 11);
      if pg_temp.r('rf'||seed, 12) = 0 and d >= 3 then perform pg_temp.tx(u,'refund', round(amt * (8 + pg_temp.r('rr'||seed, 18)) / 100.0), d - 3, 'Supplier credit note (damaged goods)', null, 'Inventory & stock', 'neft', null, id1, 12); end if;
    end if;
    if dow = 2 then perform pg_temp.tx(u,'income', 40000 + pg_temp.r('b2'||seed, 50000), d, 'Wholesale order payment', pg_temp.pick('b2m'||seed, array['Sri Lakshmi Stores','Krishna Mart','Anand Provisions','Hotel Udupi Grand','Campus Canteen']), 'Business', pg_temp.pick('b2p'||seed, array['neft','rtgs','imps','net_banking']), null, null, 14); end if;
    if dow = 5 and pg_temp.r('b3'||seed, 100) < 60 then perform pg_temp.tx(u,'income', 25000 + pg_temp.r('b3a'||seed, 40000), d, 'Bulk order payment', pg_temp.pick('b3m'||seed, array['Green Valley Apartments','Tech Park Cafeteria','Wedding caterer','School supplies order']), 'Business', pg_temp.pick('b3p'||seed, array['neft','imps','upi']), null, null, 15); end if;
    if dow = 1 then perform pg_temp.tx(u,'income', 15000 + pg_temp.r('mk'||seed, 20000), d, pg_temp.pick('mkn'||seed, array['Amazon seller payout','Flipkart settlement']), pg_temp.pick('mkm'||seed, array['Amazon','Flipkart']), 'Business', 'ecommerce', null, null, 9); end if;
    if dow = 0 then
      insert into transactions (user_id, type, amount_minor, occurred_at, name, from_account_id, to_account_id, source, tags)
      values (u, 'transfer', (25000 + pg_temp.r('dep'||seed, 15000)) * 100, least(date_trunc('day', now()) - make_interval(days => d) + interval '19 hours', now() - interval '5 minutes'), 'Cash deposited to bank', drawer, cur, 'manual', array['demo','business']);
    end if;
    if d % 9 = 3 then perform pg_temp.tx(u,'expense', 900 + pg_temp.r('fu'||seed, 900), d, 'Delivery van fuel', pg_temp.pick('fum'||seed, array['HPCL','BPCL','Indian Oil']), 'Transportation', 'debit_card', null, null, 18); end if;

    -- ---- MONTHLY ----
    if dom = 1 then perform pg_temp.tx(u,'expense', case when d > 365 then 42000 else 45000 end, d, 'Shop rent', 'Landlord — Mr. Patil', 'Rent', 'net_banking', null, null, 10);
                    perform pg_temp.tx(u,'expense', case when d > 365 then 20000 else 22000 end, d, 'Salary — Ramesh (store keeper)', 'Ramesh K', 'Staff salaries', 'imps', null, null, 11);
                    perform pg_temp.tx(u,'expense', case when d > 365 then 16000 else 18000 end, d, 'Salary — Sunita (billing)', 'Sunita R', 'Staff salaries', 'imps', null, null, 11);
                    perform pg_temp.tx(u,'expense', case when d > 365 then 14000 else 16000 end, d, 'Salary — Imran (delivery)', 'Imran S', 'Staff salaries', 'imps', null, null, 11); end if;
    if dom = 3 and d < 600 then perform pg_temp.tx(u,'expense', 28000, d, 'Business loan EMI', 'ICICI Bank', 'Loan payments', 'net_banking', null, null, 8); end if;
    if dom = 5 then perform pg_temp.tx(u,'expense', 9000 + pg_temp.r('el'||seed, 6000), d, 'Shop electricity bill', 'BESCOM', 'Utilities', 'net_banking', null, null, 11); end if;
    if dom = 6 then perform pg_temp.tx(u,'expense', 1499, d, 'Broadband', 'ACT Fibernet', 'Utilities', 'upi', null, null, 11); end if;
    if dom = 7 then perform pg_temp.tx(u,'expense', 2400, d, 'Billing software (Zoho Books)', 'Zoho', 'Subscriptions', 'credit_card', null, null, 6); end if;
    if dom = 10 then perform pg_temp.tx(u,'expense', 5000, d, 'Accountant fee', 'CA Venkatesh & Co', 'Professional fees', 'net_banking', null, null, 12); end if;
    if dom = 12 then perform pg_temp.tx(u,'expense', 8000 + pg_temp.r('ad'||seed, 7000), d, 'Google & Instagram ads', pg_temp.pick('adm'||seed, array['Google Ads','Meta Ads']), 'Marketing & ads', 'credit_card', null, null, 13); end if;
    if dom = 20 then perform pg_temp.tx(u,'expense', 20000 + pg_temp.r('gs'||seed, 12000), d, 'GST payment (GSTR-3B)', 'GST Portal', 'GST & taxes', 'net_banking', null, null, 11); end if;
    if dom = 28 then
      insert into transactions (user_id, type, amount_minor, occurred_at, name, from_account_id, to_account_id, source, tags)
      values (u, 'transfer', (40000 + pg_temp.r('dr'||seed, 10000)) * 100, least(date_trunc('day', now()) - make_interval(days => d) + interval '12 hours', now() - interval '5 minutes'), 'Owner drawings to personal account', cur, own, 'manual', array['demo','business']);
    end if;

    -- ---- QUARTERLY / YEARLY ----
    if dom = 15 and mon in (3,6,9,12) then perform pg_temp.tx(u,'expense', 35000, d, 'Advance income tax', 'Income Tax Dept', 'GST & taxes', 'net_banking', null, null, 11); end if;
    if dom = 28 and mon in (3,6,9,12) then perform pg_temp.tx(u,'income', 1800 + pg_temp.r('in'||seed, 1200), d, 'Current account interest', 'ICICI Bank', 'Interest', 'net_banking', null, null, 9); end if;
    if dom = 1 and mon = 4 then perform pg_temp.tx(u,'expense', 21500, d, 'Shop insurance (fire & burglary)', 'New India Assurance', 'Insurance', 'net_banking', null, null, 10); end if;
    if dom = 20 and mon = 3 then perform pg_temp.tx(u,'expense', 6500, d, 'Trade licence renewal', 'BBMP', 'Other', 'net_banking', null, null, 11); end if;
    if dom = 10 and mon = 7 then perform pg_temp.tx(u,'expense', 12000, d, 'Annual maintenance — AC & fixtures', 'CoolCare Services', 'Other', 'upi', null, null, 12); end if;
    if d = 210 then perform pg_temp.tx(u,'expense', 18500, d, 'Barcode scanner & POS printer', 'Amazon Business', 'Other', 'credit_card', null, null, 13); end if;
    if d = 420 then perform pg_temp.tx(u,'expense', 46000, d, 'Display racks & shelving', 'Interio Furniture', 'Other', 'net_banking', null, null, 13); end if;
    if dom = 5 and mon = 11 then perform pg_temp.tx(u,'expense', 30000, d, 'Diwali staff bonus', 'Staff', 'Staff salaries', 'imps', null, null, 12); end if;
  end loop;

  -- Today: so Today / This week / This month are never empty
  perform pg_temp.tx(u,'income', 2450,0,'Counter sale','Regular customer','Business','upi', null, null, 10);
  perform pg_temp.tx(u,'income', 18200,0,'Wholesale order payment','Krishna Mart','Business','neft', null, null, 11);
  perform pg_temp.tx(u,'expense', 380,0,'Courier charges','Delhivery','Packaging & courier','upi', null, null, 12);

  -- Unusual items worth reviewing, and an uncategorised row
  perform pg_temp.tx(u,'expense', 64000,5,'Festival bulk stock (advance)','Sharma Wholesale','Inventory & stock','rtgs', null, null, 12);
  insert into transactions (user_id, type, amount_minor, occurred_at, name, merchant, payment_method_id, source, tags)
  select u, 'expense', 450000 / 10, now() - interval '4 days', 'Misc shop expense', 'Local vendor', (select id from payment_methods where user_id=u and code='cash'), 'manual', array['demo','needs-category'];

  -- Budgets
  insert into budgets (user_id, name, period, amount_minor, category_id, channel) values
    (u,'Daily running costs','daily', 800000, null, null),
    (u,'Courier & packaging (weekly)','weekly', 800000, (select id from categories where user_id=u and name='Packaging & courier'), null),
    (u,'Inventory','monthly', 30000000, (select id from categories where user_id=u and name='Inventory & stock'), null),
    (u,'Staff salaries','monthly', 7500000, (select id from categories where user_id=u and name='Staff salaries'), null),
    (u,'Marketing','monthly', 1500000, (select id from categories where user_id=u and name='Marketing & ads'), null),
    (u,'Online payments','monthly', 40000000, null, 'online'),
    (u,'Cash expenses','monthly', 500000, null, 'offline'),
    (u,'Equipment & maintenance (yearly)','yearly', 10000000, (select id from categories where user_id=u and name='Other' and kind='expense'), null);

  -- Goals
  with g as (insert into financial_goals (user_id, name, kind, description, target_minor, target_date, contribution_frequency, status)
    values (u,'Second store branch','custom','Down payment and fit-out', 250000000, current_date + 500, 'monthly','active'),
           (u,'Stock buffer fund','emergency_fund','3 months of inventory cover', 30000000, current_date + 240, 'monthly','active'),
           (u,'Delivery van','vehicle','Replace the old van', 60000000, current_date + 300, 'monthly','active'),
           (u,'Shop renovation','custom','Completed last year', 15000000, current_date - 120, 'monthly','completed') returning id, name)
  insert into goal_contributions (user_id, goal_id, amount_minor, contributed_on, note)
  select u, g.id, case g.name when 'Second store branch' then 5000000 when 'Stock buffer fund' then 2500000 when 'Delivery van' then 3000000 else 2000000 end,
         current_date - (m * 30 + 3), case when m = 0 then 'Latest' else 'Monthly' end
  from g join generate_series(0, 11) m on (g.name in ('Second store branch','Stock buffer fund')) or (g.name = 'Delivery van' and m < 7) or (g.name = 'Shop renovation' and m between 4 and 11);

  -- Recurring
  insert into recurring_rules (user_id, name, tx_type, estimated_amount_minor, category_id, payment_method_id, frequency, next_due_date, paused)
  select u, v.n, v.t::tx_type, v.a, (select id from categories where user_id=u and name=v.c and kind=case when v.t='income' then 'income' else 'expense' end), (select id from payment_methods where user_id=u and code=v.m), v.f, current_date + v.due, v.paused
  from (values ('Shop rent','expense',4500000,'Rent','net_banking','monthly',0,false),('Staff salaries (3)','expense',5600000,'Staff salaries','imps','monthly',0,false),
               ('Business loan EMI','expense',2800000,'Loan payments','net_banking','monthly',2,false),('GST payment (GSTR-3B)','expense',2600000,'GST & taxes','net_banking','monthly',19,false),
               ('Shop electricity bill','expense',1200000,'Utilities','net_banking','monthly',4,false),('Broadband','expense',149900,'Utilities','upi','monthly',5,false),
               ('Billing software (Zoho Books)','expense',240000,'Subscriptions','credit_card','monthly',6,false),('Google & Instagram ads','expense',1150000,'Marketing & ads','credit_card','monthly',11,false),
               ('Advance income tax','expense',3500000,'GST & taxes','net_banking','quarterly',45,false),('Shop insurance','expense',2150000,'Insurance','net_banking','yearly',150,false),
               ('Amazon seller payout','income',2500000,'Business','ecommerce','weekly',1,false),('Old POS maintenance','expense',300000,'Other','upi','monthly',20,true)) v(n,t,a,c,m,f,due,paused);

  insert into savings_plans (user_id, monthly_income_minor, essential_minor, discretionary_minor, commitments_minor, current_savings_minor)
  values (u, 48000000, 36000000, 3000000, 2800000, 25000000);

  -- Bank statement waiting for review
  declare b_prev uuid := gen_random_uuid(); b_ok uuid := gen_random_uuid(); conv uuid := gen_random_uuid();
  begin
    insert into import_batches (id, user_id, file_name, file_kind, storage_path, size_bytes, status, confirmed_at, created_at) values
      (b_ok,  u, 'ICICI_current_account_Sept.csv', 'csv', 'removed', 61234, 'confirmed', now() - interval '40 days', now() - interval '40 days'),
      (b_prev, u, 'ICICI_current_account_Oct.xlsx', 'xlsx', 'demo/placeholder', 91234, 'preview', null, now() - interval '2 hours');
    insert into staged_import_transactions (user_id, batch_id, row_index, raw, amount_minor, occurred_at, merchant, description, tx_type, category_id, external_ref, confidence, is_duplicate, duplicate_reason, include) values
      (u,b_prev,0,'{"Date":"30/10/2026","Description":"NEFT-KRISHNA MART-ORDER","Withdrawal":"","Deposit":"46500.00","Ref":"ICICI-7101"}', 4650000, now() - interval '2 days', 'KRISHNA MART','NEFT-KRISHNA MART-ORDER','income',(select id from categories where user_id=u and name='Business' and kind='income'),'ICICI-7101',1.00,false,null,true),
      (u,b_prev,1,'{"Date":"29/10/2026","Description":"RTGS-SHARMA WHOLESALE","Withdrawal":"31200.00","Deposit":"","Ref":"ICICI-7102"}', 3120000, now() - interval '3 days', 'SHARMA WHOLESALE','RTGS-SHARMA WHOLESALE','expense',(select id from categories where user_id=u and name='Inventory & stock' and kind='expense'),'ICICI-7102',1.00,false,null,true),
      (u,b_prev,2,'{"Date":"28/10/2026","Description":"GST PAYMENT CBIC","Withdrawal":"24800.00","Deposit":"","Ref":"ICICI-7103"}', 2480000, now() - interval '4 days', 'CBIC','GST PAYMENT CBIC','expense',(select id from categories where user_id=u and name='GST & taxes' and kind='expense'),'ICICI-7103',1.00,false,null,true),
      (u,b_prev,3,'{"Date":"27/10/2026","Description":"UPI-AMAZON SELLER","Withdrawal":"","Deposit":"28350.00","Ref":"ICICI-7104"}', 2835000, now() - interval '5 days', 'AMAZON SELLER','UPI-AMAZON SELLER','income',(select id from categories where user_id=u and name='Business' and kind='income'),'ICICI-7104',1.00,false,null,true),
      (u,b_prev,4,'{"Date":"??","Description":"CHQ DEP 004512","Withdrawal":"","Deposit":"15000.00","Ref":""}', 1500000, null, 'CHQ DEP 004512','CHQ DEP 004512','income',null,null,0.55,false,null,false),
      (u,b_prev,5,'{"Date":"26/10/2026","Description":"ATM WDL SHOP","Withdrawal":"10000.00","Deposit":"","Ref":"ICICI-7106"}', 1000000, now() - interval '6 days', 'ATM WDL SHOP','ATM WDL SHOP','expense',null,'ICICI-7106',0.80,false,null,true);

    insert into ai_conversations (id, user_id, title) values (conv, u, 'What are my biggest business costs?');
    insert into ai_messages (user_id, conversation_id, role, content, created_at) values
      (u, conv, 'user', 'What recurring payments do I have?', now() - interval '1 hour'),
      (u, conv, 'assistant', (select 'Your recurring items:' || E'\n' || string_agg(format('• %s — ₹%s %s, next %s', name, to_char(estimated_amount_minor/100, 'FM99,99,99,990'), frequency, next_due_date), E'\n' order by next_due_date) from recurring_rules where user_id=u and not paused), now() - interval '1 hour');
  end;

  insert into notifications (user_id, kind, title, body, created_at) values
    (u,'budget','Budget "Inventory" reached 85%','You have used 85% of this monthly budget.', now() - interval '2 days'),
    (u,'budget','Budget "Marketing" reached 100%','You have used 100% of this monthly budget.', now() - interval '6 days'),
    (u,'recurring','Upcoming: Business loan EMI','₹28,000 due in 2 days.', now() - interval '5 hours'),
    (u,'recurring','Upcoming: GST payment (GSTR-3B)','About ₹26,000 due on the 20th.', now() - interval '1 day'),
    (u,'unusual','Unusual spending to review','₹64,000 at Sharma Wholesale is higher than your usual Inventory purchase. This is a prompt to review, not a finding of fraud.', now() - interval '5 days'),
    (u,'goal','Stock buffer fund: 50% reached','Nice progress — keep it going.', now() - interval '12 days'),
    (u,'import','ICICI statement ready to review','6 rows found — 1 needs fixing.', now() - interval '2 hours'),
    (u,'summary','Your weekly business summary is ready','Sales were higher than last week.', now() - interval '1 day');
  update notifications set read_at = created_at + interval '1 hour' where user_id = u and created_at < now() - interval '10 days';
end $$;

select 'Business demo created. Log in with rohan.demo@smartfin.demo, password Demo@12345' as result;
