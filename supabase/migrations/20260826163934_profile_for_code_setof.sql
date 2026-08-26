-- פונקציה שמחזירה composite מחזירה שורה אחת של NULLים כשאין התאמה,
-- ולא אפס שורות. לכן קוד שגוי "זוהה" כמשתמשת ריקה במקום להיכשל.
-- SETOF מחזיר אפס שורות, וכל ה-join-ים שמעליו מתרוקנים איתו.
drop function if exists private.profile_for_code(text) cascade;

create or replace function private.profile_for_code(p_code text)
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p
  join public.access_links l on l.profile_id = p.id
  where l.code = p_code and not l.revoked;
$$;
revoke all on function private.profile_for_code(text) from public, anon, authenticated;

-- ה-cascade הפיל את שלוש הפונקציות שנשענו עליה; מחזירים אותן כפי שהיו
create or replace function public.link_whoami(p_code text)
returns table(full_name text, role public.app_role, school_id uuid, school_name text)
language sql stable security definer set search_path = ''
as $$
  select pr.full_name, pr.role, pr.school_id, s.name
  from private.profile_for_code(p_code) pr
  left join public.schools s on s.id = pr.school_id;
$$;

create or replace function public.link_rows(p_code text, p_month text)
returns setof public.teacher_months
language sql stable security definer set search_path = ''
as $$
  select tm.*
  from private.profile_for_code(p_code) pr
  join public.teacher_months tm
    on tm.month_key = p_month and tm.school_id = pr.school_id
  where pr.role = 'principal';
$$;

create or replace function public.link_save_row(p_code text, p_row jsonb)
returns public.teacher_months
language plpgsql security definer set search_path = ''
as $$
declare
  pr public.profiles;
  target public.teacher_months;
  result public.teacher_months;
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

  update public.teacher_months set
    name              = coalesce(p_row ->> 'name', name),
    tz_id             = coalesce(p_row ->> 'tz_id', tz_id),
    email             = coalesce(p_row ->> 'email', email),
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
    changed_at        = now(),
    approved          = false,
    net_approved      = false,
    updated_at        = now()
  where id = target.id
  returning * into result;

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;

revoke all on function public.link_whoami(text)          from public;
revoke all on function public.link_rows(text, text)      from public;
revoke all on function public.link_save_row(text, jsonb) from public;
grant execute on function public.link_whoami(text)          to anon, authenticated;
grant execute on function public.link_rows(text, text)      to anon, authenticated;
grant execute on function public.link_save_row(text, jsonb) to anon, authenticated;
