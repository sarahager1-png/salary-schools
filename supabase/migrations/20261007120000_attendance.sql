-- דוח נוכחות חודשי דיגיטלי לעובדי מנהלה (שרה, 6.10.26).
--
-- "תכין דוח נוכחות לחודש למזכירה זיו… תכין דיגיטלי שתמלא ותשלח עד ה-4 בחודש".
-- העובדת מקבלת קישור אישי, ממלאת לכל יום שעת כניסה ושעת יציאה, ושולחת עד
-- ה-4 בחודש שאחרי. שרה וחשבת השכר רואות את הדוח במערכת.
--
-- העובדת אינה משתמשת רשומה: הגישה שלה היא רק דרך שתי פונקציות שמזהות אותה
-- לפי קוד הקישור, כמו קישורי המנהלות. אין לה גישה לטבלאות עצמן.
create table if not exists public.attendance_people (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique check (length(code) >= 20),   -- קוד הקישור האישי
  name       text        not null,
  role_title text        not null default '',
  school_id  uuid        references public.schools(id) on delete set null,
  phone      text,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_reports (
  person_id    uuid        not null references public.attendance_people(id) on delete cascade,
  month_key    text        not null check (month_key ~ '^\d{4}-\d{2}$'),
  days         jsonb       not null default '{}'::jsonb,   -- { "2026-09-01": { "in":"08:00", "out":"14:00", "note":"" } }
  total_hours  numeric     not null default 0,
  work_days    integer     not null default 0,
  submitted_at timestamptz,                                -- ריק = טיוטה; מלא = נשלח וננעל
  updated_at   timestamptz not null default now(),
  primary key (person_id, month_key)
);

alter table public.attendance_people  enable row level security;
alter table public.attendance_reports enable row level security;

drop policy if exists attendance_people_read_staff on public.attendance_people;
create policy attendance_people_read_staff on public.attendance_people
  for select to authenticated using (private.my_role() in ('coordinator', 'clerk'));

drop policy if exists attendance_reports_read_staff on public.attendance_reports;
create policy attendance_reports_read_staff on public.attendance_reports
  for select to authenticated using (private.my_role() in ('coordinator', 'clerk'));

-- פתיחה מחדש של דוח שנשלח (ביטול הנעילה) — רכזת בלבד
drop policy if exists attendance_reports_reopen on public.attendance_reports;
create policy attendance_reports_reopen on public.attendance_reports
  for update to authenticated using (private.my_role() = 'coordinator') with check (private.my_role() = 'coordinator');

-- ── קריאת הדוח לפי קוד הקישור ──
create or replace function public.attendance_get(p_code text, p_month text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.attendance_people; r public.attendance_reports;
begin
  if p_code is null or length(p_code) < 20 or p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then return null; end if;
  select * into p from public.attendance_people where code = p_code and active;
  if not found then return null; end if;
  select * into r from public.attendance_reports where person_id = p.id and month_key = p_month;
  return jsonb_build_object(
    'name', p.name, 'role', p.role_title,
    'school', (select regexp_replace(s.name, '\s+', ' ', 'g') from public.schools s where s.id = p.school_id),
    'month', p_month,
    'days', coalesce(r.days, '{}'::jsonb), 'total', coalesce(r.total_hours, 0), 'workDays', coalesce(r.work_days, 0),
    'submittedAt', r.submitted_at, 'updatedAt', r.updated_at);
end $$;

-- ── שמירה / שליחה לפי קוד הקישור ──
-- מותר רק לחודש הנוכחי ולקודם (לפי שעון ישראל); דוח שנשלח נעול. הסיכומים
-- מחושבים כאן ולא מתקבלים מהדפדפן.
create or replace function public.attendance_save(p_code text, p_month text, p_days jsonb, p_submit boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.attendance_people; r public.attendance_reports;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  k text; v jsonb; t_in text; t_out text; note text;
  clean jsonb := '{}'::jsonb; total numeric := 0; wdays integer := 0; mins integer;
begin
  if p_code is null or length(p_code) < 20 or p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'קישור לא תקין'; end if;
  select * into p from public.attendance_people where code = p_code and active;
  if not found then raise exception 'קישור לא תקין'; end if;
  if p_month not in (to_char(today, 'YYYY-MM'), to_char(date_trunc('month', today) - interval '1 day', 'YYYY-MM')) then
    raise exception 'אפשר למלא רק את החודש הנוכחי או הקודם';
  end if;
  select * into r from public.attendance_reports where person_id = p.id and month_key = p_month;
  if found and r.submitted_at is not null then raise exception 'הדוח כבר נשלח'; end if;
  if p_days is null or jsonb_typeof(p_days) <> 'object' or length(p_days::text) > 20000 then raise exception 'נתונים לא תקינים'; end if;

  for k, v in select * from jsonb_each(p_days) loop
    if k !~ '^\d{4}-\d{2}-\d{2}$' or left(k, 7) <> p_month or jsonb_typeof(v) <> 'object' then continue; end if;
    begin perform k::date; exception when others then continue; end;   -- תאריך שאינו קיים
    t_in  := coalesce(v->>'in', '');  t_out := coalesce(v->>'out', '');
    note  := left(coalesce(v->>'note', ''), 200);
    if t_in  !~ '^([01]\d|2[0-3]):[0-5]\d$' then t_in  := ''; end if;
    if t_out !~ '^([01]\d|2[0-3]):[0-5]\d$' then t_out := ''; end if;
    if t_in = '' and t_out = '' and note = '' then continue; end if;
    clean := clean || jsonb_build_object(k, jsonb_build_object('in', t_in, 'out', t_out, 'note', note));
    if t_in <> '' and t_out <> '' then
      mins := (split_part(t_out, ':', 1)::int * 60 + split_part(t_out, ':', 2)::int)
            - (split_part(t_in,  ':', 1)::int * 60 + split_part(t_in,  ':', 2)::int);
      if mins > 0 then total := total + mins / 60.0; wdays := wdays + 1; end if;
    end if;
  end loop;

  insert into public.attendance_reports (person_id, month_key, days, total_hours, work_days, submitted_at, updated_at)
  values (p.id, p_month, clean, round(total, 2), wdays, case when coalesce(p_submit, false) then now() end, now())
  on conflict (person_id, month_key) do update
    set days = excluded.days, total_hours = excluded.total_hours, work_days = excluded.work_days,
        submitted_at = excluded.submitted_at, updated_at = now()
    where public.attendance_reports.submitted_at is null;
  -- שתי שמירות בו-זמנית: אם הדוח ננעל בינתיים, העדכון דולג — מודיעים ולא מחזירים הצלחה
  if not found then raise exception 'הדוח כבר נשלח'; end if;
  return public.attendance_get(p_code, p_month);
end $$;

revoke all on function public.attendance_get(text, text) from public;
revoke all on function public.attendance_save(text, text, jsonb, boolean) from public;
grant execute on function public.attendance_get(text, text) to anon, authenticated;
grant execute on function public.attendance_save(text, text, jsonb, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
