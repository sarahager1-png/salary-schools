/*
  "שעות שילוב יורדות גם מהספירה" (שרה, 10.9.2026).

  תקן השעות של בית הספר נמדד מול שעות עובדות ההוראה בלבד: בלי מנהלת,
  בלי מי שבחל"ד/חל"ת החודש (8.9), ומעכשיו גם בלי מורה לשילוב
  (gamul_role = 'inclusion'). אותו כלל בדיוק כמו schoolHours באפליקציה,
  כדי שהמספר שהמנהלת רואה במסך האישור, החריגה בדוח הרשת והחסימה כאן
  יהיו אותו מספר.

  מחליף רק את p_hours_of; link_approve_data ו-hours_vs_committed קוראים לה
  ואינם משתנים. חזרה: להריץ את ההגדרה מ-20260908140000_approval_declaration.sql.
*/
create or replace function public.p_hours_of(p_school uuid, p_month text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(t.frontal_hours), 0)
  from public.teacher_months t
  where t.school_id = p_school and t.month_key = p_month
    and coalesce(t.gamul_role, '') not in ('principal', 'inclusion')
    and coalesce(t.leave_type, 'none') not in ('maternity', 'unpaid');
$$;
