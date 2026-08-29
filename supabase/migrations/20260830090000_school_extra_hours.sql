-- שעות הוראה נוספות שמוקצות לבית ספר מעבר למכסה, עם הסיבה.
--
-- רמת ישי: חיבור כיתות ג'-ד' מזכה ב-12 שעות הוראה נוספות (שרה, 30.8).
-- הן נשמרות בנפרד מהמכסה כדי שהסיבה לא תלך לאיבוד — המכסה האפקטיבית
-- היא המכסה + התוספת.
alter table public.schools
  add column if not exists extra_hours integer not null default 0,
  add column if not exists extra_hours_note text;

update public.schools
   set extra_hours = 12, extra_hours_note = 'חיבור כיתות ג׳-ד׳'
 where name = 'שלהבות רמת ישי';

notify pgrst, 'reload schema';
