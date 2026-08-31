-- נסיעות ומעונות — שני רכיבי עלות שלא היו במערכת כלל.
--
-- נסיעות: צו הרחבה מ-11.8.2016 מחייב השתתפות בהוצאות נסיעה. התשלום לפי
-- ימי עבודה בפועל, עד ₪22.60 ליום (או כרטיס חודשי — הזול מביניהם).
-- הרשת משלמת לפי ימים, ולכן נשמר כאן מספר הימים; התעריף היומי יושב בקוד.
--
-- מעונות: אין חובה חוקית על מעסיק, אבל בעובדי הוראה זו זכות מוכרת —
-- אם לילד עד גיל 5, עד שני ילדים במקביל, בלי קבלות, ופרו-רטה לפי אחוז
-- משרה. הסכומים מתעדכנים בינואר בחוזר הממונה על השכר.
--
-- שניהם החזר הוצאות: אינם פנסיוניים, אינם נושאים קרן השתלמות, ואינם
-- נספרים בשכר המינימום — אבל כן חייבים במס שכר ובביטוח לאומי.
alter table public.teacher_months
  add column if not exists travel_days       integer not null default 0,
  add column if not exists daycare_children  integer not null default 0;

alter table public.teacher_months
  drop constraint if exists travel_days_range,
  drop constraint if exists daycare_children_range;

alter table public.teacher_months
  add constraint travel_days_range      check (travel_days between 0 and 31),
  -- התוספת משולמת לכל היותר עבור שני ילדים בו-זמנית
  add constraint daycare_children_range check (daycare_children between 0 and 2);

comment on column public.teacher_months.travel_days is
  'ימי עבודה בפועל לחישוב דמי נסיעה (צו הרחבה 2016, עד ₪22.60 ליום)';
comment on column public.teacher_months.daycare_children is
  'מספר ילדים עד גיל 5 לתוספת מעונות — 0, 1 או 2';

-- ── הקישור למנהלת ─────────────────────────────────────────────
-- המנהלת היא שיודעת כמה ימים המורה הגיעה וכמה ילדים קטנים יש לה,
-- ולכן שני השדות נוספים לרשימת העמודות הסגורה של שתי הפונקציות.

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

revoke all on function public.link_add_row(text, text, jsonb) from public;
grant execute on function public.link_add_row(text, text, jsonb) to anon, authenticated;

-- link_save_row: שני השדות אינם "שינוי בסיס" — הם אינם מזיזים את הברוטו
-- לעובדת ולכן אינם מבטלים סימולציה או אישור, בדיוק כמו ימי היעדרות.
create or replace function public.link_save_row(p_code text, p_row jsonb)
returns public.teacher_months
language plpgsql security definer set search_path = ''
as $$
declare
  pr public.profiles;
  target public.teacher_months;
  result public.teacher_months;
  base_changed boolean;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr.id is null or pr.role <> 'principal' then
    raise exception 'הקישור אינו תקף';
  end if;

  select * into target from public.teacher_months where id = (p_row ->> 'id')::uuid;
  if target.id is null or target.school_id <> pr.school_id then
    raise exception 'השורה אינה שייכת לבית הספר שלך';
  end if;
  if exists (select 1 from public.months m where m.key = target.month_key and m.locked) then
    raise exception 'החודש % נעול', target.month_key;
  end if;
  if coalesce(p_row ->> 'leave_type', target.leave_type) <> 'none'
     and coalesce(nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date, target.leave_from) is null then
    raise exception 'יש למלא תאריך יציאה לחופשה';
  end if;

  base_changed :=
       coalesce(p_row ->> 'reform',     target.reform)     is distinct from target.reform
    or coalesce(p_row ->> 'level',      target.level)      is distinct from target.level
    or coalesce(p_row ->> 'degree',     target.degree)     is distinct from target.degree
    or coalesce(p_row ->> 'grade',      target.grade)      is distinct from target.grade
    or coalesce(p_row ->> 'gamul_role', target.gamul_role) is distinct from target.gamul_role
    or coalesce(p_row ->> 'age_group',  target.age_group)  is distinct from target.age_group
    or coalesce(p_row ->> 'leave_type', target.leave_type) is distinct from target.leave_type
    or coalesce(nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date, target.leave_from) is distinct from target.leave_from
    or coalesce(nullif(btrim(coalesce(p_row ->> 'leave_to',   '')), '')::date, target.leave_to)   is distinct from target.leave_to
    or coalesce(nullif(btrim(coalesce(p_row ->> 'nihul_grade', '')), '')::smallint, target.nihul_grade) is distinct from target.nihul_grade
    or coalesce((p_row ->> 'seniority')::int,         target.seniority)         is distinct from target.seniority
    or coalesce((p_row ->> 'frontal_hours')::int,     target.frontal_hours)     is distinct from target.frontal_hours
    or coalesce((p_row ->> 'scope_pct')::int,         target.scope_pct)         is distinct from target.scope_pct
    or coalesce((p_row ->> 'children_under_18')::int, target.children_under_18) is distinct from target.children_under_18;

  perform set_config('app.via_link', '1', true);

  update public.teacher_months set
    name              = coalesce(p_row ->> 'name', name),
    tz_id             = coalesce(p_row ->> 'tz_id', tz_id),
    email             = coalesce(p_row ->> 'email', email),
    phone             = coalesce(p_row ->> 'phone', phone),
    reform            = coalesce(p_row ->> 'reform', reform),
    level             = coalesce(p_row ->> 'level', level),
    grade             = coalesce(p_row ->> 'grade', grade),
    degree            = coalesce(p_row ->> 'degree', degree),
    seniority         = coalesce((p_row ->> 'seniority')::int, seniority),
    frontal_hours     = coalesce((p_row ->> 'frontal_hours')::int, frontal_hours),
    scope_pct         = coalesce((p_row ->> 'scope_pct')::int, scope_pct),
    gamul_role        = coalesce(p_row ->> 'gamul_role', gamul_role),
    age_group         = coalesce(p_row ->> 'age_group', age_group),
    is_temp           = coalesce((p_row ->> 'is_temp')::boolean, is_temp),
    children_under_18 = coalesce((p_row ->> 'children_under_18')::int, children_under_18),
    absence_days      = coalesce((p_row ->> 'absence_days')::int, absence_days),
    mm_hours          = coalesce((p_row ->> 'mm_hours')::int, mm_hours),
    mm_for            = coalesce(p_row ->> 'mm_for', mm_for),
    monthly_extras    = coalesce((p_row ->> 'monthly_extras')::int, monthly_extras),
    travel_days       = coalesce((p_row ->> 'travel_days')::int, travel_days),
    daycare_children  = coalesce((p_row ->> 'daycare_children')::int, daycare_children),
    nihul_grade       = case when p_row ? 'nihul_grade'
                             then nullif(btrim(coalesce(p_row ->> 'nihul_grade', '')), '')::smallint
                             else nihul_grade end,
    leave_type        = coalesce(p_row ->> 'leave_type', leave_type),
    leave_from        = case when p_row ? 'leave_from'
                             then nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date
                             else leave_from end,
    leave_to          = case when p_row ? 'leave_to'
                             then nullif(btrim(coalesce(p_row ->> 'leave_to', '')), '')::date
                             else leave_to end,
    snapshot          = case when base_changed and snapshot is null
                             then p_row -> 'snapshot' else snapshot end,
    official_gross     = case when base_changed then null else official_gross end,
    official_gross_pre = case when base_changed then null else official_gross_pre end,
    approved           = case when base_changed then false else approved end,
    net_approved       = case when base_changed then false else net_approved end,
    changed_at         = case when base_changed then now() else changed_at end,
    updated_at         = now()
  where id = target.id
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;

revoke all on function public.link_save_row(text, jsonb) from public;
grant execute on function public.link_save_row(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
