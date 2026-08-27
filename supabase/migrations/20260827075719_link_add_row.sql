-- מנהלת מוסיפה מורה דרך הקישור.
--
-- עד עכשיו הקישור ידע לעדכן שורות קיימות בלבד, והמורות היו צריכות
-- להיווצר קודם בידי הרשת. כשמה שנדרש מהמנהלת הוא למלא את הרשימה
-- מאפס — שמות, ת.ז., מסלול, ותק, שעות — זו בדיוק הפעולה החסרה.
--
-- אותם גבולות כמו בעדכון: בית הספר נגזר מהקוד ולא מהקלט, החודש חייב
-- להיות פתוח, ואין דרך להזין כסף או אישורים — העמודות האלה פשוט אינן
-- ברשימה שנכתבת.
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

  perform set_config('app.via_link', '1', true);

  insert into public.teacher_months (
    month_key, school_id, name, tz_id, email, reform, level, grade, degree,
    seniority, frontal_hours, scope_pct, gamul_role, age_group, is_temp,
    children_under_18, absence_days, mm_hours, mm_for, monthly_extras, changed_at
  ) values (
    p_month,
    pr.school_id,                                   -- מהקוד, לא מהקלט
    btrim(p_row ->> 'name'),
    nullif(btrim(coalesce(p_row ->> 'tz_id', '')), ''),
    nullif(btrim(coalesce(p_row ->> 'email', '')), ''),
    coalesce(p_row ->> 'reform', 'ofek'),
    coalesce(p_row ->> 'level', 'elementary'),
    coalesce(p_row ->> 'grade', '1'),
    coalesce(p_row ->> 'degree', 'BA'),
    coalesce((p_row ->> 'seniority')::int, 0),
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
    now()
  )
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;

revoke all on function public.link_add_row(text, text, jsonb) from public;
grant execute on function public.link_add_row(text, text, jsonb) to anon, authenticated;

-- הטריגר של הרשאות העמודה הוא BEFORE UPDATE בלבד, אבל ה-INSERT מגיע
-- מ-anon בלי פרופיל — ולכן צריך גם מדיניות INSERT? לא: הפונקציה היא
-- SECURITY DEFINER ורצה בהרשאות הבעלים, שעוקפות RLS. הגבולות נאכפים
-- כאן, בגוף הפונקציה, בדיוק כמו ב-link_save_row.

notify pgrst, 'reload schema';
