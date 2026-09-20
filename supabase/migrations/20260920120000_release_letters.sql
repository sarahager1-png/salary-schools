-- כתב קבלה וסילוק — חתימה דיגיטלית או העלאת טופס חתום, דרך קישור אישי.
--
-- שרה, 20.9: "הסכם לעפולה... תשלח לכל העובדים של עפולה ממערכת השכר, תן
-- אופציה לחתימה דיגיטלית, תן אופציה להעלאה למי שלא חתם. מיועד רק למי
-- שהועסק במוסד עד שנה שעברה." — ולכן הרשומה נוצרת פר-עובד בבחירה של
-- שרה, לא אוטומטית לכל בית הספר.
--
-- אותו מבנה כמו teacher_onboarding: הטבלה סגורה ל-anon, והעובד פועל רק
-- דרך פונקציות rl_* שמקבלות את הקוד.

create table if not exists public.release_letters (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  name          text not null,
  tz_id         text,
  phone         text,
  code          text not null unique,
  -- הפרטים הקבועים של המסמך, כפי שהצוות הגדיר: employer_name, employer_num,
  -- workplace, place, from_date, to_date, role. מה שחסר — העובד משלים.
  doc           jsonb not null default '{}'::jsonb,
  -- מה שהעובד מילא ברגע החתימה (נשמר כפי שנחתם, לא מתעדכן אחר כך)
  fields        jsonb,
  signed_at     timestamptz,
  signature_path text,
  sign_meta     jsonb,          -- כתובת IP ודפדפן ברגע החתימה
  -- המסלול השני: טופס שנחתם ידנית, צולם והועלה
  upload_path   text,
  uploaded_at   timestamptz,
  -- "אם לא מועסק שיעשה וי — לא עבדתי במוסד בשנים קודמות" (שרה, 20.9):
  -- המסמך מיועד רק לוותיקים; עובד חדש מצהיר ופטור מהחתימה.
  not_employed_at timestamptz,
  revoked      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists release_letters_school_idx on public.release_letters (school_id);

-- אישור עורך דין — "זה לא של הרשת, שיבחר כרצונו" (שרה, 20.9): כל עובד בוחר
-- עו"ד בעצמו. אחרי חתימת העובד נפתח קישור נפרד (lawyer_code) שהעובד מעביר
-- לעורך הדין; הוא רואה את המסמך החתום, ממלא שם ומס' רישיון וחותם.
-- החתימות נשמרות גם כ-data URL בשורה עצמה: הדלי סגור לקריאה מבחוץ, ועורך
-- הדין חייב לראות את חתימת העובד שעליה הוא מאשר.
alter table public.release_letters
  add column if not exists signature_data text,
  add column if not exists lawyer_code text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists lawyer_name text,
  add column if not exists lawyer_license text,
  add column if not exists lawyer_signature_data text,
  -- "חייב חותמת עורך דין" (שרה, 20.9) — צילום החותמת, חובה לצד החתימה
  add column if not exists lawyer_stamp_data text,
  add column if not exists lawyer_signed_at timestamptz,
  add column if not exists lawyer_meta jsonb;
create unique index if not exists release_letters_lawyer_code_idx on public.release_letters (lawyer_code);

alter table public.release_letters enable row level security;

drop policy if exists rl_staff_read on public.release_letters;
drop policy if exists rl_staff_write on public.release_letters;
create policy rl_staff_read on public.release_letters
  for select to authenticated using (private.my_role() in ('coordinator','clerk','network'));
create policy rl_staff_write on public.release_letters
  for all to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

-- מה העובד רואה כשהוא פותח את הקישור. קוד עורך הדין נחשף רק אחרי שהעובד חתם.
drop function if exists public.rl_whoami(text);
create function public.rl_whoami(p_code text)
returns table(name text, tz_id text, school_name text, doc jsonb, fields jsonb,
              signed boolean, signed_at timestamptz, uploaded boolean, uploaded_at timestamptz,
              not_employed boolean, lawyer_code text, lawyer_signed boolean,
              lawyer_name text, lawyer_signed_at timestamptz)
language sql volatile security definer set search_path = ''
as $$
  update public.release_letters set last_used_at = now() where code = p_code and not revoked;
  select r.name, r.tz_id, s.name, r.doc, r.fields,
         r.signed_at is not null, r.signed_at, r.upload_path is not null, r.uploaded_at,
         r.not_employed_at is not null,
         case when r.signed_at is not null then r.lawyer_code end,
         r.lawyer_signed_at is not null, r.lawyer_name, r.lawyer_signed_at
  from public.release_letters r
  join public.schools s on s.id = r.school_id
  where r.code = p_code and not r.revoked;
$$;

-- חתימה דיגיטלית — פעם אחת בלבד. מסמך חתום אינו נדרס: ניסיון שני נדחה,
-- וכך אי אפשר לשנות בדיעבד את מה שנחתם.
drop function if exists public.rl_sign(text, jsonb, text, text);
create or replace function public.rl_sign(p_code text, p_fields jsonb, p_signature_path text, p_signature_data text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare hdr json;
begin
  if coalesce(p_signature_path, '') = '' or split_part(p_signature_path, '/', 1) <> p_code then
    raise exception 'חסרה חתימה';
  end if;
  if coalesce(p_signature_data, '') not like 'data:image/png;base64,%' or length(p_signature_data) > 400000 then
    raise exception 'חסרה חתימה';
  end if;
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  update public.release_letters set
    fields = p_fields,
    tz_id = coalesce(nullif(regexp_replace(coalesce(p_fields ->> 'tz', ''), '\D', '', 'g'), ''), tz_id),
    signature_path = p_signature_path,
    signature_data = p_signature_data,
    signed_at = now(),
    sign_meta = jsonb_build_object(
      'ip', split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(p_user_agent, hdr ->> 'user-agent', ''), 300)),
    updated_at = now(), last_used_at = now()
  where code = p_code and not revoked and signed_at is null;
  if not found then raise exception 'הקישור אינו תקף, או שהמסמך כבר נחתם'; end if;
end;
$$;

-- רישום טופס חתום שהועלה. אפשר להחליף קובץ (צילום לא ברור) — הקודם נשאר בדלי.
create or replace function public.rl_upload(p_code text, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_path, '') = '' or split_part(p_path, '/', 1) <> p_code then
    raise exception 'חסר קובץ';
  end if;
  update public.release_letters set
    upload_path = p_path, uploaded_at = now(), updated_at = now(), last_used_at = now()
  where code = p_code and not revoked;
  if not found then raise exception 'הקישור אינו תקף'; end if;
end;
$$;

-- הצהרת "לא עבדתי במוסד בשנים קודמות". ניתנת לביטול (סימון בטעות) כל עוד
-- לא נחתם מסמך; מי שכבר חתם — ההצהרה אינה רלוונטית ונדחית.
create or replace function public.rl_not_employed(p_code text, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.release_letters set
    not_employed_at = case when p_on then now() else null end,
    updated_at = now(), last_used_at = now()
  where code = p_code and not revoked and signed_at is null and upload_path is null;
  if not found then raise exception 'הקישור אינו תקף, או שכבר התקבל מסמך חתום'; end if;
end;
$$;
revoke all on function public.rl_not_employed(text, boolean) from public;
grant execute on function public.rl_not_employed(text, boolean) to anon, authenticated;

-- מה עורך הדין רואה: המסמך כפי שנחתם, עם חתימת העובד. רק אחרי חתימת העובד.
drop function if exists public.rl_lawyer_view(text);
drop function if exists public.rl_lawyer_sign(text, text, text, text, text);
create or replace function public.rl_lawyer_view(p_lcode text)
returns table(name text, school_name text, fields jsonb, signed_at timestamptz, signature_data text,
              lawyer_name text, lawyer_license text, lawyer_signature_data text, lawyer_signed_at timestamptz,
              lawyer_stamp_data text)
language sql stable security definer set search_path = ''
as $$
  select r.name, s.name, r.fields, r.signed_at, r.signature_data,
         r.lawyer_name, r.lawyer_license, r.lawyer_signature_data, r.lawyer_signed_at,
         r.lawyer_stamp_data
  from public.release_letters r
  join public.schools s on s.id = r.school_id
  where r.lawyer_code = p_lcode and not r.revoked and r.signed_at is not null;
$$;

-- אישור עורך הדין — פעם אחת בלבד, ורק על מסמך שהעובד כבר חתם עליו.
create or replace function public.rl_lawyer_sign(p_lcode text, p_name text, p_license text, p_signature_data text, p_stamp_data text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare hdr json;
begin
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'יש למלא שם מלא'; end if;
  if length(regexp_replace(coalesce(p_license, ''), '\D', '', 'g')) < 3 then raise exception 'יש למלא מספר רישיון'; end if;
  if coalesce(p_signature_data, '') not like 'data:image/png;base64,%' or length(p_signature_data) > 400000 then
    raise exception 'חסרה חתימה';
  end if;
  if coalesce(p_stamp_data, '') not like 'data:image/%' or length(p_stamp_data) > 700000 then
    raise exception 'חסרה חותמת עורך הדין';
  end if;
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  update public.release_letters set
    lawyer_stamp_data = p_stamp_data,
    lawyer_name = trim(p_name), lawyer_license = trim(p_license),
    lawyer_signature_data = p_signature_data, lawyer_signed_at = now(),
    lawyer_meta = jsonb_build_object(
      'ip', split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(p_user_agent, hdr ->> 'user-agent', ''), 300)),
    updated_at = now()
  where lawyer_code = p_lcode and not revoked and signed_at is not null and lawyer_signed_at is null;
  if not found then raise exception 'הקישור אינו תקף, או שהאישור כבר ניתן'; end if;
end;
$$;
revoke all on function public.rl_lawyer_view(text) from public;
revoke all on function public.rl_lawyer_sign(text, text, text, text, text, text) from public;
grant execute on function public.rl_lawyer_view(text) to anon, authenticated;
grant execute on function public.rl_lawyer_sign(text, text, text, text, text, text) to anon, authenticated;

revoke all on function public.rl_whoami(text) from public;
revoke all on function public.rl_sign(text, jsonb, text, text, text) from public;
revoke all on function public.rl_upload(text, text) from public;
grant execute on function public.rl_whoami(text) to anon, authenticated;
grant execute on function public.rl_sign(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.rl_upload(text, text) to anon, authenticated;

-- דלי נפרד ופרטי. לעובד מותר רק להוסיף קובץ לתיקיית הקוד שלו — לא לקרוא
-- ולא לדרוס; הצפייה היא של הצוות בלבד.
insert into storage.buckets (id, name, public) values ('release-letters','release-letters',false)
  on conflict (id) do nothing;

-- בדיקת הקוד בפונקציית security definer ולא בתת-שאילתה: הטבלה סגורה
-- ל-anon, ותת-שאילתה במדיניות רצה בהרשאות הפונה ורואה אפס שורות — כל
-- העלאה נדחית. אותה מלכודת כמו בקליטה (20260827214500_ob_storage_check).
create or replace function private.rl_code_ok(p_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.release_letters t
                 where t.code = p_code and not t.revoked);
$$;
revoke all on function private.rl_code_ok(text) from public;
grant execute on function private.rl_code_ok(text) to anon, authenticated;

drop policy if exists rl_files_ins on storage.objects;
drop policy if exists rl_files_staff on storage.objects;
create policy rl_files_ins on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'release-letters' and private.rl_code_ok((storage.foldername(name))[1]));
create policy rl_files_staff on storage.objects for all to authenticated
  using (bucket_id = 'release-letters' and private.my_role() in ('coordinator','clerk','network'))
  with check (bucket_id = 'release-letters' and private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
