-- "תוסיף גם עמודה ריקה מוסתרת: דיוק השתתפות הרשת" (שרה, 10.9.2026)
-- שדה ידני בדף עלות ההוראה, בעמודות המוסתרות. אינו משתתף בשום חישוב —
-- מקום לרשום את הסכום המדויק של השתתפות הרשת כשהוא מתברר.
alter table public.school_finance
  add column if not exists network_support_adj numeric;
comment on column public.school_finance.network_support_adj is
  'דיוק השתתפות הרשת — הקלדה ידנית של שרה, לא נמשך ממבט-רשת ולא נכנס לחישוב';
notify pgrst, 'reload schema';
