-- הכנסות מול הוצאות ללא עלות הוראה (שרה, 3.9) — מהתקציב במבט-רשת.
alter table public.school_finance
  add column if not exists income_total numeric,
  add column if not exists expenses_other numeric;
