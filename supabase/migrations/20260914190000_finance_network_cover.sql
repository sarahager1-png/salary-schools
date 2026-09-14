-- "על פי זה יוחלט כמה השלמה הרשת לוקחת על עצמה" (שרה, 14.9.2026)
-- ההחלטה עצמה: כמה מתוך "בלי הרשת · בפועל +10%" הרשת מכסה, בש"ח לשנה.
-- שדה ידני בדף עלות ההוראה; אינו נכנס לחישוב עד שמעתיקים אותו
-- ל-network_support בלחיצה מפורשת.
alter table public.school_finance
  add column if not exists network_cover numeric;
comment on column public.school_finance.network_cover is
  'הרשת מכסה — סכום שנתי ששרה מחליטה עליו מול "בלי הרשת · בפועל +10%"; לא נכנס לחישוב';
notify pgrst, 'reload schema';
