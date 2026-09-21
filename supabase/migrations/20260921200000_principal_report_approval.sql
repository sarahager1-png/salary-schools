/*
  דיווח המנהלות: חלון 1–20 בחודש, ואישור שרה לפני סימולציה ושכר.

  "ניתן לדווח מה-1 עד ה-20. עובר לשכר רק באישורי" (שרה, 21.9.26).
  "חני אסולין שלחה דיווח חדש ועבר מייד לסימולציה — אין מצב כזה. אם לא
  אאשר לא עובר לסימולציה. ממתין לי לאישור; רק רשומה מאושרת עוברת לשכר."

  1. teacher_months.report_pending — כל שמירה של מנהלת (קישור או כניסה
     רגילה) מסמנת את השורה "ממתין לאישור דיווח". רק הרכזת מנקה.
  2. כל עוד הסימן דולק: אין בקשת חישוב (sim_requests), חשבת השכר אינה
     מזינה ברוטו ואינה מאשרת, והשרת אינו ממלא ברוטו. קרון ה-6 מדלג עליה.
  3. private.link_locked — המנהלת משנה רק בימים 1–20 לפי שעון ישראל.
     lock_due זז ל-21 בחודש שאחרי חודש העבודה.
*/

alter table public.teacher_months
  add column if not exists report_pending boolean not null default false,
  add column if not exists report_pending_at timestamptz;
comment on column public.teacher_months.report_pending is
  'דיווח של מנהלת שממתין לאישור שרה. עד שמאושר — אין סימולציה ואין שכר.';

create or replace function private.link_locked(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.locked
        or extract(day from (now() at time zone 'Asia/Jerusalem'))::int > 20
        or (m.lock_due is not null
            and (now() at time zone 'Asia/Jerusalem')::date >= m.lock_due)
    from public.months m
    where m.key = p_key
  ), false);
$$;
revoke all on function private.link_locked(text) from public;

update public.months
   set lock_due = (to_date(key || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '20 days')::date;

CREATE OR REPLACE FUNCTION public.link_save_row(p_code text, p_row jsonb)
 RETURNS teacher_months
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if private.link_locked(target.month_key) then
    raise exception 'הדיווח פתוח מה-1 עד ה-20 בכל חודש. החודש % סגור כעת לשינויים.', target.month_key;
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
    or coalesce(p_row ->> 'job',        target.job)        is distinct from target.job
    or (p_row ? 'extra_roles' and
        array(select jsonb_array_elements_text(case when jsonb_typeof(p_row -> 'extra_roles') = 'array' then p_row -> 'extra_roles' else '[]'::jsonb end))
          is distinct from target.extra_roles)
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
    job               = coalesce(p_row ->> 'job', job),
    extra_roles       = case when p_row ? 'extra_roles'
                             then array(select jsonb_array_elements_text(case when jsonb_typeof(p_row -> 'extra_roles') = 'array' then p_row -> 'extra_roles' else '[]'::jsonb end))
                             else extra_roles end,
    seniority         = coalesce((p_row ->> 'seniority')::int, seniority),
    frontal_hours     = coalesce((p_row ->> 'frontal_hours')::int, frontal_hours),
    individual_hours  = case when p_row ? 'individual_hours'
                             then nullif(btrim(coalesce(p_row ->> 'individual_hours', '')), '')::smallint
                             else individual_hours end,
    presence_hours    = case when p_row ? 'presence_hours'
                             then nullif(btrim(coalesce(p_row ->> 'presence_hours', '')), '')::smallint
                             else presence_hours end,
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
    report_pending     = true,
    report_pending_at  = now(),
    updated_at         = now()
  where id = target.id
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.link_add_row(p_code text, p_month text, p_row jsonb)
 RETURNS teacher_months
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if private.link_locked(p_month) then
    raise exception 'הדיווח פתוח מה-1 עד ה-20 בכל חודש. החודש % סגור כעת לשינויים.', p_month;
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
    leave_type, leave_from, leave_to, nihul_grade, job, extra_roles, changed_at
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
    coalesce(p_row ->> 'job', 'teaching'),
    array(select jsonb_array_elements_text(case when jsonb_typeof(p_row -> 'extra_roles') = 'array' then p_row -> 'extra_roles' else '[]'::jsonb end)),
    now()
  )
  returning * into result;

  -- כל דיווח מהקישור ממתין לאישור שרה לפני סימולציה ושכר (21.9.26)
  update public.teacher_months
     set report_pending = true, report_pending_at = now()
   where id = result.id
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_column_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.app_role := private.my_role();
  changed text[] := '{}';
  col text;
  base_changed boolean;
  is_server boolean := (select auth.uid()) is null
                       and coalesce(current_setting('request.jwt.claim.role', true),
                                    current_setting('role', true), '') <> 'authenticated';
begin
  if coalesce(current_setting('app.via_link', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;

  select array_agg(key) into changed
  from jsonb_each_text(to_jsonb(old)) o
  where o.value is distinct from (to_jsonb(new) ->> o.key);

  if changed is null then return new; end if;

  if r is null and is_server then
    foreach col in array changed loop
      if col = 'official_gross' and old.official_gross is null and not old.report_pending then
        continue;
      end if;
      if col not in ('reported_at', 'late_report', 'payroll_ready',
                     'leave_type', 'leave_from', 'leave_to', 'updated_at') then
        raise exception 'השרת אינו רשאי לשנות %', private.col_label(col);
      end if;
    end loop;
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
  if r = 'principal' and private.link_locked(new.month_key) then
    raise exception 'הדיווח פתוח מה-1 עד ה-20 בכל חודש. החודש % סגור כעת לשינויים.', new.month_key;
  end if;

  /*
    אישור הדיווח (שרה, 21.9.26): "אם לא אאשר לא עובר לסימולציה ... רק
    רשומה מאושרת עוברת לשכר". רק הרכזת מסמנת דיווח כמאושר; עד אז אסור
    להזין ברוטו או לאשר שכר על השורה.
  */
  if 'report_pending' = any(changed) and r <> 'coordinator'
     and not (r = 'principal' and new.report_pending) then
    raise exception 'רק שרה מאשרת דיווח של מנהלת';
  end if;
  if r = 'clerk' and old.report_pending
     and changed && array['official_gross', 'official_gross_pre', 'chabad_supp', 'approved'] then
    raise exception 'הדיווח של המנהלת ממתין לאישור שרה — אין סימולציה ואין אישור לפני כן';
  end if;

  base_changed := changed && array[
    'reform', 'grade', 'degree', 'level', 'age_group', 'seniority',
    'gamul_role', 'scope_pct', 'frontal_hours', 'children_under_18',
    'job', 'hourly_rate', 'extra_roles'
  ];

  if r = 'principal' then
    foreach col in array changed loop
      if base_changed and (
           (col in ('official_gross', 'official_gross_pre', 'chabad_supp',
                    'approved_at', 'approved_by', 'net_approved_at', 'net_approved_by')
            and (to_jsonb(new) ->> col) is null)
        or (col = 'approved'     and not new.approved)
        or (col = 'net_approved' and not new.net_approved)
      ) then
        continue;
      end if;
      if col in ('official_gross', 'official_gross_pre', 'chabad_supp', 'agreed_gross',
                 'actual_employer_cost', 'approved', 'approved_at', 'approved_by',
                 'net_approved', 'net_approved_at', 'net_approved_by', 'school_id',
                 'payroll_ready', 'slip_issued_at', 'slip_gross', 'hourly_rate') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in (
        'official_gross', 'official_gross_pre', 'chabad_supp', 'actual_employer_cost',
        'gross_set_at', 'gross_set_by',
        'seniority', 'degree', 'grade', 'level', 'age_group', 'gamul_role', 'extra_roles', 'reform',
        'slip_issued_at', 'slip_gross',
        'individual_hours', 'presence_hours',
        'absence_days', 'absence_reason', 'sick_form_path', 'mm_hours', 'mm_for', 'mm_from', 'mm_to',
        -- משרה שעתית: התעריף הוא שכר, והוא שלה (15.9)
        'hourly_rate',
        'approved', 'approved_at', 'approved_by', 'changed_at', 'snapshot', 'updated_at'
      ) then
        raise exception 'חשבת שכר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'network' then
    raise exception 'התפקיד הזה אינו מעדכן שורות שכר';
  end if;

  -- כל שינוי של מנהלת בכניסה רגילה הוא דיווח שממתין לאישור
  if r = 'principal' then
    new.report_pending := true;
    new.report_pending_at := now();
  end if;

  if new.approved and not old.approved then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;

-- בקשת חישוב לשורה שממתינה לאישור דיווח — נדחית בשרת, מכל מקור
create or replace function private.block_sim_on_pending_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.teacher_months t
              where t.id = new.teacher_month_id and t.report_pending) then
    raise exception 'הדיווח ממתין לאישור שרה — הסימולציה תישלח אחרי האישור';
  end if;
  return new;
end;
$$;
drop trigger if exists sim_requests_block_pending on public.sim_requests;
create trigger sim_requests_block_pending
  before insert on public.sim_requests
  for each row execute function private.block_sim_on_pending_report();

notify pgrst, 'reload schema';
