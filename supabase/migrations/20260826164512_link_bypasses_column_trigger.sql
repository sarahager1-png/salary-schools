-- טריגר אכיפת העמודות דורש פרופיל, ולמי שנכנס בקישור אין auth.uid().
-- הוא נחסם משמירה עם "למשתמש אין פרופיל במערכת".
--
-- link_save_row כבר מאמתת את הקוד, את בעלות בית הספר ואת נעילת החודש,
-- והיא מעדכנת רשימת עמודות קבועה שאינה כוללת כסף או אישורים — כלומר
-- בדיוק מה שהטריגר בא לאכוף. לכן היא מסמנת לו לוותר, והסימון מקומי
-- לטרנזקציה ואי אפשר להגיע אליו מבחוץ.

create or replace function private.enforce_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.app_role := private.my_role();
  changed text[] := '{}';
  col text;
begin
  -- עדכון שהגיע מ-link_save_row: כבר עבר אימות מלא שם
  if coalesce(current_setting('app.via_link', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;

  if r is null then
    raise exception 'למשתמש אין פרופיל במערכת';
  end if;

  if exists (select 1 from public.months m where m.key = new.month_key and m.locked)
     and r <> 'coordinator' then
    raise exception 'החודש % נעול', new.month_key;
  end if;

  select array_agg(key) into changed
  from jsonb_each_text(to_jsonb(old)) o
  where o.value is distinct from (to_jsonb(new) ->> o.key);

  if changed is null then return new; end if;

  if r = 'principal' then
    foreach col in array changed loop
      if col in ('official_gross', 'official_gross_pre', 'agreed_gross',
                 'actual_employer_cost', 'approved', 'approved_at', 'approved_by',
                 'net_approved', 'net_approved_at', 'net_approved_by', 'school_id') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'actual_employer_cost', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'network' then
    foreach col in array changed loop
      if col not in ('net_approved', 'net_approved_at', 'net_approved_by', 'updated_at') then
        raise exception 'המאשרת הרשתית אינה רשאית לשנות את %', col;
      end if;
    end loop;
    if new.net_approved and not old.approved then
      raise exception 'אי אפשר לאשר אישור רשתי לפני אישור השליח';
    end if;
  end if;

  if new.approved and not old.approved then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;
  if new.net_approved and not old.net_approved then
    new.net_approved_at := now();
    new.net_approved_by := (select auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- הסימון נדלק רק בתוך link_save_row, ורק לטרנזקציה הנוכחית
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

  perform set_config('app.via_link', '1', true);

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

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;

revoke all on function public.link_save_row(text, jsonb) from public;
grant execute on function public.link_save_row(text, jsonb) to anon, authenticated;
