-- אחוז משרה — אחד לכל מסלול, לא אחד לשניהם.
--
-- מורה באופק מקבלת אחוז משרה באופק, ואחוז משרה אחר בעולם הישן. עד
-- היום החזקנו עמודה אחת, והיא שימשה גם לסימולציית האופק וגם לסימולציית
-- הבסיס — ולכן הבסיס יצא שגוי אצל כל מורת אופק.
--
-- דבורי גלפרין היא ההוכחה: רשום לה 91%, והמספר שנשמר לה בעמודת הבסיס
-- (10,611) מתקבל במחשבון רק ב-103%. הרצנו את חמש האפשרויות האחרות —
-- תואר שני, בכיר, ותק אחר — ואף אחת מהן לא מגיעה לשם. רק האחוז.
--
-- זה לא הבדל תצוגה: הפער בין שתי הסימולציות הוא **תוספת בית חב"ד**,
-- מה שהרשת משלמת מכיסה. אחוז בסיס שגוי ב-12 נקודות אצל דבורי הוא
-- 1,235 ₪ בחודש שהתוספת שלה מנופחת או חסרה בהם.
--
-- העמודה החדשה נשארת ריקה. אין דרך לגזור אותה ממה שיש — היא נקבעת
-- ביד, כמו אחותה, וריק פירושו "טרם נקבע" ולא "100".

alter table public.teacher_months
  add column if not exists scope_pct_pre    integer,
  add column if not exists scope_pre_set_at timestamptz;

alter table public.teacher_months
  drop constraint if exists teacher_months_scope_pct_pre_check;
alter table public.teacher_months
  add constraint teacher_months_scope_pct_pre_check
    check (scope_pct_pre is null or (scope_pct_pre > 0 and scope_pct_pre <= 200));

comment on column public.teacher_months.scope_pct_pre is
  'אחוז המשרה בעולם הישן. למורת אופק זה אחוז אחר מ-scope_pct, וזה האחוז שנכנס לסימולציית הבסיס. ריק = טרם נקבע.';
comment on column public.teacher_months.scope_pre_set_at is
  'מתי אחוז העולם הישן נקבע ביד. ריק = טרם נקבע.';

/*
  למורה בעולם ישן יש אחוז אחד, והוא כבר יושב ב-scope_pct. העתקה שלו
  לעמודה החדשה שומרת על משמעות אחת לעמודה — "האחוז שנכנס למחשבון
  העולם הישן" — בלי להמציא נתון לאיש. למורות אופק העמודה נשארת ריקה.
*/
do $$
begin
  perform set_config('app.via_link', '1', true);
  update public.teacher_months
     set scope_pct_pre    = scope_pct,
         scope_pre_set_at = scope_set_at
   where reform is distinct from 'ofek'
     and scope_pct_pre is null
     and scope_pct is not null;
end $$;

notify pgrst, 'reload schema';
