/*
  שעות מחוץ לתקן — חלקיות (שרה, 15.9.2026): "כן 3 שעות מלמדת בכיתות" —
  יועצת ירושלים: 8 שעות, מהן 5 ייעוץ (מחוץ לתקן) ו-3 הוראה בכיתות (בתקן).

  non_quota_hours: כמה משעות השורה אינן נספרות בתקן (ייעוץ / שילוב חלקי).
  ריק = ברירת המחדל: יועצת — כל שעותיה מחוץ לתקן; מורה לשילוב — כולן;
  אחרת — אפס. ערך שהוזן גובר (ובמורה לשילוב — השורה כולה נשארת מחוץ).

  חזרה: p_hours_of מ-20260915150000; drop column non_quota_hours.
*/
alter table public.teacher_months
  add column if not exists non_quota_hours smallint
    check (non_quota_hours is null or non_quota_hours >= 0);
comment on column public.teacher_months.non_quota_hours is
  'שעות מחוץ לתקן (ייעוץ/שילוב חלקי). ריק = יועצת כולן, אחרת 0.';

create or replace function public.p_hours_of(p_school uuid, p_month text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(greatest(0, t.frontal_hours - coalesce(
           t.non_quota_hours,
           case when t.gamul_role in ('counselor', 'counselor2') then t.frontal_hours else 0 end))), 0)
  from public.teacher_months t
  where t.school_id = p_school and t.month_key = p_month
    and coalesce(t.job, 'teaching') = 'teaching'
    and coalesce(t.gamul_role, '') not in ('principal', 'inclusion')
    and coalesce(t.leave_type, 'none') not in ('maternity', 'unpaid');
$$;

notify pgrst, 'reload schema';
