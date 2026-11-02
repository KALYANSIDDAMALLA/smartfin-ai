-- Sample loans for ALL demo logins (@smartfin.demo). Run AFTER supabase/migrations/20261101000008_loans.sql and the demo seeds.
--   Priya (salaried):  Home loan (matches her ₹6,500 monthly EMI) + a Personal loan
--   Arjun (student):   Education loan (repayment starts later) + a 0% phone EMI
--   Rohan (business):  Business loan (matches his ₹28,000 EMI) + a Delivery van loan
-- Dates are relative to the day you run it, so each loan always has paid EMIs behind it and the next one coming up.
-- Re-runnable: it replaces only these demo users' loans. Users that do not exist are skipped. Real users are never touched.
create or replace function pg_temp.add_loan(p_email text, p_name text, p_lender text, p_kind text, p_principal_rupees numeric, p_rate numeric, p_months int, p_emi_rupees numeric, p_first_due date)
returns void language plpgsql as $$
declare u uuid; l uuid; r numeric := p_rate / 1200; emi bigint;
begin
  select id into u from auth.users where email = p_email; if u is null then return; end if;
  emi := case when p_emi_rupees is not null then round(p_emi_rupees * 100)
              when r = 0 then round(p_principal_rupees * 100 / p_months)
              else round(p_principal_rupees * 100 * r * power(1 + r, p_months) / (power(1 + r, p_months) - 1)) end;
  insert into loans (user_id, name, lender, kind, principal_minor, interest_rate_pct, tenure_months, emi_minor, first_due_date)
  values (u, p_name, p_lender, p_kind, round(p_principal_rupees * 100), p_rate, p_months, emi, p_first_due) returning id into l;
  -- every instalment that has already fallen due is recorded as paid on its due date
  insert into loan_payments (user_id, loan_id, installment_no, paid_on, amount_minor)
  select u, l, n, (p_first_due + ((n - 1) || ' months')::interval)::date, emi
  from generate_series(1, p_months) n where (p_first_due + ((n - 1) || ' months')::interval)::date <= current_date;
end $$;

do $$
declare m date := date_trunc('month', current_date)::date;
begin
  delete from loans where user_id in (select id from auth.users where email in ('priya.demo@smartfin.demo', 'arjun.demo@smartfin.demo', 'rohan.demo@smartfin.demo'));
  -- Priya
  perform pg_temp.add_loan('priya.demo@smartfin.demo', 'Home loan', 'HDFC Bank', 'home', 660000, 8.5, 180, 6500, (m - interval '17 months')::date + 2);
  perform pg_temp.add_loan('priya.demo@smartfin.demo', 'Personal loan', 'ICICI Bank', 'personal', 150000, 12, 24, null, (m - interval '6 months')::date + 4);
  -- Arjun
  perform pg_temp.add_loan('arjun.demo@smartfin.demo', 'Education loan', 'State Bank of India', 'education', 400000, 8.15, 84, null, (m + interval '8 months')::date + 4);
  perform pg_temp.add_loan('arjun.demo@smartfin.demo', 'Phone EMI', 'Bajaj Finserv', 'other', 36000, 0, 12, null, (m - interval '3 months')::date + 6);
  -- Rohan
  perform pg_temp.add_loan('rohan.demo@smartfin.demo', 'Business loan', 'ICICI Bank', 'business', 1287000, 11, 60, 28000, (m - interval '13 months')::date + 2);
  perform pg_temp.add_loan('rohan.demo@smartfin.demo', 'Delivery van loan', 'HDFC Bank', 'vehicle', 600000, 9.5, 36, null, (m - interval '3 months')::date + 9);
end $$;
