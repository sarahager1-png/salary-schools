-- ותק ברירת מחדל 1, לא 0 — על הגרסה העדכנית של הפונקציה.
--
-- "אין ותק 0" (שרה, 1.9) נאכף ב-CHECK, אבל link_add_row — שדרכה מנהלת
-- מוסיפה מורה מהקישור האישי — נשארה עם 0 מקודד, וכל הוספה נכשלה.
--
-- והתיקון הראשון החזיר בטעות את גרסת 27.8 של הפונקציה, ואיתה נמחקו
-- חל"ד, טלפון, דרגת ניהול, נסיעות ומעונות שנוספו לה מאז. smoke-leave
-- תפסה זאת מיד. כאן הבסיס הוא הגרסה האחרונה (20260829120000), עם
-- שינוי הוותק בלבד.
--
-- greatest ולא coalesce בלבד: גם 0 מפורש הופך ל-1, כי אפס אינו ותק.

create or replace function public.link_add_row(p_code text, p_month text, p_row jsonb)
returns public.teacher_months
language plpgsql security definer set search_path = ''
as $$
declare
  pr public.profiles;
  result public.teacher_months;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr.id is null or pr.role <> 'principal' then
    raise exception 'הקישור אינו תקף';
  end if;
  if not exists (select 1 from public.months m where m.key = p_month) then
    raise exception 'החודש % אינו פתוח', p_month;
  end if;
  if exists (select 1 from public.months m where m.key = p_month and m.locked) then
    raise exception 'החודש % נעול', p_month;
  end if;
  if coalesce(btrim(p_row ->> 'name'), '') = '' then
    raise exception 'יש למלא שם מורה';
  end if;
  if coalesce(p_row ->> 'leave_type', 'none') <> 'none'
     and nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '') is null then
    raise exception 'יש למלא תאריך יציאה לחופשה';
  end if;

  perform set_config('app.via_link', '1', true);

  insert into public.teacher_months (
    month_key, school_id, name, tz_id, email, phone, reform, level, grade, degree,
    seniority, frontal_hours, scope_pct, gamul_role, age_group, is_temp,
    children_under_18, absence_days, mm_hours, mm_for, monthly_extras,
    travel_days, daycare_children,
    leave_type, leave_from, leave_to, nihul_grade, changed_at
  ) values (
    p_month,
    pr.school_id,
    btrim(p_row ->> 'name'),
    nullif(btrim(coalesce(p_row ->> 'tz_id', '')), ''),
    nullif(btrim(coalesce(p_row ->> 'email', '')), ''),
    nullif(btrim(coalesce(p_row ->> 'phone', '')), ''),
    coalesce(p_row ->> 'reform', 'ofek'),
    coalesce(p_row ->> 'level', 'elementary'),
    coalesce(p_row ->> 'grade', '1'),
    coalesce(p_row ->> 'degree', 'BA'),
    greatest(1, coalesce((p_row ->> 'seniority')::int, 1)),
    coalesce((p_row ->> 'frontal_hours')::int, 0),
    coalesce((p_row ->> 'scope_pct')::int, 100),
    coalesce(p_row ->> 'gamul_role', 'none'),
    coalesce(p_row ->> 'age_group', 'none'),
    coalesce((p_row ->> 'is_temp')::boolean, false),
    coalesce((p_row ->> 'children_under_18')::int, 0),
    coalesce((p_row ->> 'absence_days')::int, 0),
    coalesce((p_row ->> 'mm_hours')::int, 0),
    nullif(btrim(coalesce(p_row ->> 'mm_for', '')), ''),
    coalesce((p_row ->> 'monthly_extras')::int, 0),
    coalesce((p_row ->> 'travel_days')::int, 0),
    coalesce((p_row ->> 'daycare_children')::int, 0),
    coalesce(p_row ->> 'leave_type', 'none'),
    nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date,
    nullif(btrim(coalesce(p_row ->> 'leave_to', '')), '')::date,
    nullif(btrim(coalesce(p_row ->> 'nihul_grade', '')), '')::smallint,
    now()
  )
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;

notify pgrst, 'reload schema';
