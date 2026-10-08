-- מענק הרשת ששולם בפועל לסניף בחודש (שרה, 8.10.26: "לחלק ל-2, תכנון מול ביצוע לכל חלק";
-- "צודק, זה גם משתנה מהמנכ"ל"). מוזן בדף המנכ"ל בידי מנהל הרשת בלבד — דרך השרת
-- (api/monthly-summary, פעולת setGrantPaid), לא ישירות מהדפדפן.
alter table public.school_payment_ledger
  add column if not exists grant_paid numeric check (grant_paid is null or grant_paid >= 0);
comment on column public.school_payment_ledger.grant_paid is
  'מענק הרשת ששולם בפועל לסניף בחודש הזה; מוזן בידי מנהל הרשת בדף המנכ"ל';

notify pgrst, 'reload schema';
