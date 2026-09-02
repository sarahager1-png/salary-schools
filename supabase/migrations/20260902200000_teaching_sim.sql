-- "אני עשיתי סימולציית שכר לפני הסימולציה האמיתית — חשוב לי לדעת מה
-- הפער" (שרה, 2.9). עלות ההוראה המתוכננת מהסימולציה שלה במערכות
-- התקציב נשמרת לצד התקציב והייעול, והדף מציג אותה מול העלות בפועל.
alter table public.school_finance
  add column if not exists teaching_sim numeric
  check (teaching_sim is null or teaching_sim >= 0);
