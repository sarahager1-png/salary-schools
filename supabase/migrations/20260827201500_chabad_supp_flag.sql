-- האם בית הספר משלם תוספת בית חב"ד.
--
-- שרה: "במזכרת בתיה אין תוספת בית חב"ד". שם התשלום ישיר — אין רכיב
-- תוספת, לא על פער האופק ולא על רכיב שכר המינימום. בשאר בתי הספר
-- המודל נשאר.
alter table public.schools
  add column if not exists chabad_supp boolean not null default true;

update public.schools set chabad_supp = false where name = 'שלהבות מזכרת בתיה';

notify pgrst, 'reload schema';
