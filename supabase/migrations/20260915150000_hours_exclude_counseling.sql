/*
  "יש גם 5 שעות ייעוץ" (שרה, 15.9.2026, ירושלים): שעות ייעוץ אינן בתקן
  השעות. במערכת התקציב הייעוץ מתומחר בנפרד (counseling_hours_per_class),
  ולא בתוך השעות לכיתה — ולכן יועצת יוצאת מהספירה, כמו מורה לשילוב.

  מחליף את p_hours_of מ-20260915120000_teacher_jobs.sql; זהה ל-schoolHours באפליקציה.
  חזרה: להריץ את ההגדרה מ-20260915120000_teacher_jobs.sql.
*/
create or replace function public.p_hours_of(p_school uuid, p_month text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(t.frontal_hours), 0)
  from public.teacher_months t
  where t.school_id = p_school and t.month_key = p_month
    and coalesce(t.job, 'teaching') = 'teaching'
    and coalesce(t.gamul_role, '') not in ('principal', 'inclusion', 'counselor', 'counselor2')
    and coalesce(t.leave_type, 'none') not in ('maternity', 'unpaid');
$$;
