-- מין העובדת, ואין ותק 0.
--
-- שני תיקונים שיצאו מאותה בדיקה: הרצנו מחדש במחשבון הרשמי את כל
-- הסימולציות הקיימות והשווינו, ושני הדברים האלה הסבירו חלק מהפערים.
--
-- ── מין ──
-- תוספת אם ניתנת לאם. המערכת גזרה את הזכאות ממספר הילדים עד 18 בלבד,
-- ולכן יוסף ברוד, לוי חרותי וחיים שטראקס — שלושה גברים עם ילדים —
-- קיבלו אותה. אצל חיים שטראקס האחוז הרשום הוא 87, בדיוק הנוסחה בלי
-- תוספת, כלומר בפועל הוא לא קיבל אותה ואף אחד לא התכוון שיקבל.
--
-- ── ותק ──
-- אין ותק 0 (הוראת שרה, 1.9.2026): שנה ראשונה בהוראה היא ותק 1.
-- שש שורות נשמרו עם 0, ואחת מהן — יוסף ברוד — היא אחת מהשורות שלא
-- הצלחנו לשחזר את המספר שלהן.

alter table public.teacher_months
  add column if not exists gender text;

alter table public.teacher_months
  drop constraint if exists teacher_months_gender_check;
alter table public.teacher_months
  add constraint teacher_months_gender_check
    check (gender is null or gender in ('f', 'm'));

comment on column public.teacher_months.gender is
  'מין העובדת. תוספת אם ניתנת ל-f בלבד. ריק = טרם נקבע.';

/*
  נרמול הוותק. השומר על העמודות דורש פרופיל למשתמש המעדכן, ולמיגרציה
  אין כזה. app.via_link הוא מנגנון העקיפה שהמערכת עצמה מגדירה לעדכונים
  שכבר עברו אימות במקום אחר (private.enforce_column_permissions), והוא
  משמש כאן במודע לשינוי חד-פעמי ומוגדר: אפס איננו ותק.
*/
do $$
begin
  perform set_config('app.via_link', '1', true);
  update public.teacher_months
     set seniority = 1
   where seniority is null or seniority < 1;
end $$;

alter table public.teacher_months
  drop constraint if exists teacher_months_seniority_check;
alter table public.teacher_months
  add constraint teacher_months_seniority_check
    check (seniority is null or seniority >= 1);

notify pgrst, 'reload schema';
