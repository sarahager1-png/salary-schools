-- בעיות בתלושי שכר שמנהלת מדווחת מהקישור החודשי שלה (שרה, 11.10.26:
-- "תשלח למנהלות שאם יש בעיות בתלושי שכר שירשמו שם ומה הבעיה, תוסיף בקישור של ההעדרויות").
-- המנהלת כותבת שם עובד/ת ומה הבעיה; הרכזת וחשבת השכר רואות את הרשימה במסך האישורים
-- ומסמנות "טופל". הדיווח אינו משנה שום נתון שכר.

create table if not exists public.slip_issues (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  month_key        text not null,
  teacher_month_id uuid references public.teacher_months(id) on delete set null,
  teacher_name     text not null,
  issue            text not null,
  status           text not null default 'open',
  resolution       text,
  resolved_at      timestamptz,
  resolved_by      uuid references auth.users(id) on delete set null,
  constraint slip_issues_status_check check (status in ('open', 'done')),
  constraint slip_issues_name_len  check (char_length(btrim(teacher_name)) between 2 and 80),
  constraint slip_issues_issue_len check (char_length(btrim(issue)) between 3 and 600),
  constraint slip_issues_resolution_len check (resolution is null or char_length(resolution) <= 300)
);
create index if not exists slip_issues_school_idx on public.slip_issues (school_id, created_at desc);
create index if not exists slip_issues_open_idx   on public.slip_issues (status) where status = 'open';

alter table public.slip_issues enable row level security;

-- קריאה וסימון "טופל": הרכזת וחשבת השכר בלבד. המנהלת ניגשת רק דרך הפונקציות שלמטה.
drop policy if exists slip_issues_read_staff on public.slip_issues;
create policy slip_issues_read_staff on public.slip_issues
  for select to authenticated using (private.my_role() in ('coordinator', 'clerk'));

drop policy if exists slip_issues_resolve_staff on public.slip_issues;
create policy slip_issues_resolve_staff on public.slip_issues
  for update to authenticated
  using (private.my_role() in ('coordinator', 'clerk'))
  with check (private.my_role() in ('coordinator', 'clerk'));

-- ההרשאות מאופסות במפורש: טבלה חדשה מקבלת הרשאות ברירת מחדל רחבות. הצוות קורא, ומעדכן
-- רק את הסטטוס ואת התשובה; בית הספר, השם והתיאור אינם ניתנים לשינוי אחרי הדיווח.
revoke all on table public.slip_issues from public, anon, authenticated;
grant select on table public.slip_issues to authenticated;
grant update (status, resolution) on public.slip_issues to authenticated;

-- מי סימן ומתי נקבעים במסד, לא בדפדפן
create or replace function private.slip_issue_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
  elsif new.status = 'open' then
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolution  := null;
  end if;
  return new;
end;
$$;
revoke all on function private.slip_issue_stamp() from public, anon, authenticated;

drop trigger if exists slip_issue_stamp on public.slip_issues;
create trigger slip_issue_stamp before update on public.slip_issues
  for each row execute function private.slip_issue_stamp();

/* דיווח בעיה מהקישור של המנהלת. בית הספר נגזר מהקוד, לא מהבקשה. */
create or replace function public.link_slip_issue_add(p_code text, p_name text, p_issue text)
returns public.slip_issues
language plpgsql security definer set search_path = ''
as $$
declare pr record; v_month text; v_name text; v_issue text; v_row uuid; out_row public.slip_issues;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr is null or pr.role <> 'principal' then raise exception 'הקישור אינו של מנהלת בית ספר'; end if;
  -- חודש הדיווח של הקישור; אם אין לבית הספר חודש פתוח, החודש הנוכחי לפי שעון ישראל
  v_month := coalesce(public.p_month_of(p_code), to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM'));
  v_name  := btrim(regexp_replace(coalesce(p_name, ''),  '\s+', ' ', 'g'));
  v_issue := btrim(coalesce(p_issue, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'יש לכתוב את שם העובד/ת'; end if;
  if char_length(v_issue) < 3 then raise exception 'יש לכתוב מה הבעיה בתלוש'; end if;
  if char_length(v_issue) > 600 then raise exception 'התיאור ארוך מדי (עד 600 תווים)'; end if;

  -- בלם: עד 60 דיווחים פתוחים לבית ספר, כדי שקישור שדלף לא ימלא את הטבלה.
  -- נעילת שורת בית הספר: שתי בקשות בו-זמנית לא יעברו שתיהן את הספירה.
  perform 1 from public.schools sc where sc.id = pr.school_id for update;
  if (select count(*) from public.slip_issues s where s.school_id = pr.school_id and s.status = 'open') >= 60 then
    raise exception 'יש כבר הרבה דיווחים פתוחים. כדאי לפנות לחשבת השכר.';
  end if;

  select t.id into v_row from public.teacher_months t
   where t.school_id = pr.school_id and t.month_key = v_month
     and btrim(regexp_replace(t.name, '\s+', ' ', 'g')) = v_name
   limit 1;

  insert into public.slip_issues (school_id, month_key, teacher_month_id, teacher_name, issue)
  values (pr.school_id, v_month, v_row, v_name, v_issue)
  returning * into out_row;
  return out_row;
end;
$$;

/* מה שבית הספר דיווח: כל הפתוחים, ומה שטופל בשישים הימים האחרונים */
create or replace function public.link_slip_issues(p_code text)
returns setof public.slip_issues
language plpgsql security definer set search_path = ''
as $$
declare pr record;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr is null or pr.role <> 'principal' then raise exception 'הקישור אינו של מנהלת בית ספר'; end if;
  return query
    select s.* from public.slip_issues s
     where s.school_id = pr.school_id
       and (s.status = 'open' or (s.status = 'done' and s.resolved_at > now() - interval '60 days'))
     order by (s.status = 'open') desc, s.created_at desc, s.id desc
     limit 150;
end;
$$;

revoke all on function public.link_slip_issue_add(text, text, text) from public;
revoke all on function public.link_slip_issues(text) from public;
grant execute on function public.link_slip_issue_add(text, text, text) to anon, authenticated;
grant execute on function public.link_slip_issues(text) to anon, authenticated;

notify pgrst, 'reload schema';
