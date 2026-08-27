-- קליטת עובדת הוראה: טופס 101, מסמכים וחתימות — דרך קישור אישי לטלפון.
--
-- שרה, 27.8: כל עובדת מקבלת קישור עם טופס 101 בחתימה דיגיטלית, העלאת
-- ת.ז., חתימה על חוזה (יועלה מחר), טופס נתוני שכר של משרד החינוך,
-- ואסמכתת תיק במשרד החינוך. מי שלא תשלים עד סוף השבוע הבא — אין
-- משכורת ספטמבר.

create table if not exists public.teacher_onboarding (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  tz_id         text,
  name          text not null,
  phone         text,
  code          text not null unique,
  -- טופס 101: התשובות כ-jsonb, חתום כשיש חתימה ותאריך
  form101       jsonb,
  form101_signed_at timestamptz,
  -- נתיבי הקבצים בדלי onboarding, כולם תחת התיקייה של הקוד
  signature_path      text,   -- חתימת 101
  id_doc_path         text,   -- צילום ת.ז
  salary_form_path    text,   -- טופס נתוני שכר משרד החינוך
  ministry_file_path  text,   -- אסמכתת תיק במשרד החינוך
  contract_signature_path text,
  contract_signed_at  timestamptz,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.teacher_onboarding enable row level security;

-- הטבלה סגורה ל-anon; הגישה דרך פונקציות עם הקוד בלבד
create policy ob_staff_read on public.teacher_onboarding
  for select to authenticated using (private.my_role() is not null);
create policy ob_staff_write on public.teacher_onboarding
  for all to authenticated
  using (private.my_role() in ('coordinator','clerk'))
  with check (private.my_role() in ('coordinator','clerk'));

-- מה העובדת רואה כשהיא פותחת את הקישור
create or replace function public.ob_whoami(p_code text)
returns table(name text, tz_id text, school_name text,
              form101 jsonb, form101_signed boolean,
              has_id_doc boolean, has_salary_form boolean, has_ministry_file boolean,
              contract_signed boolean, contract_available boolean)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.tz_id, s.name,
         o.form101, o.form101_signed_at is not null,
         o.id_doc_path is not null, o.salary_form_path is not null, o.ministry_file_path is not null,
         o.contract_signed_at is not null,
         exists (select 1 from storage.objects ob
                 where ob.bucket_id = 'onboarding' and ob.name = 'contract/contract.pdf')
  from public.teacher_onboarding o
  join public.schools s on s.id = o.school_id
  where o.code = p_code and not o.revoked;
$$;

-- שמירת טופס 101 (עם או בלי חתימה) ורישום קבצים שהועלו
create or replace function public.ob_save(p_code text, p_patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare o public.teacher_onboarding;
begin
  select * into o from public.teacher_onboarding where code = p_code and not revoked;
  if o.id is null then raise exception 'הקישור אינו תקף'; end if;
  update public.teacher_onboarding set
    form101            = coalesce(p_patch -> 'form101', form101),
    form101_signed_at  = case when (p_patch ->> 'sign101')::boolean then now() else form101_signed_at end,
    signature_path     = coalesce(p_patch ->> 'signature_path', signature_path),
    id_doc_path        = coalesce(p_patch ->> 'id_doc_path', id_doc_path),
    salary_form_path   = coalesce(p_patch ->> 'salary_form_path', salary_form_path),
    ministry_file_path = coalesce(p_patch ->> 'ministry_file_path', ministry_file_path),
    contract_signature_path = coalesce(p_patch ->> 'contract_signature_path', contract_signature_path),
    contract_signed_at = case when (p_patch ->> 'sign_contract')::boolean then now() else contract_signed_at end,
    last_used_at = now(), updated_at = now()
  where id = o.id;
end;
$$;

revoke all on function public.ob_whoami(text) from public;
revoke all on function public.ob_save(text, jsonb) from public;
grant execute on function public.ob_whoami(text) to anon, authenticated;
grant execute on function public.ob_save(text, jsonb) to anon, authenticated;

-- דלי הקבצים: פרטי; לעובדת מותר להעלות ולקרוא רק בתוך התיקייה של הקוד
-- שלה, והחוזה הכללי פתוח לקריאה לכל מי שמחזיקה קישור פעיל.
insert into storage.buckets (id, name, public) values ('onboarding','onboarding',false)
  on conflict (id) do nothing;

create policy ob_files_ins on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'onboarding'
    and exists (select 1 from public.teacher_onboarding t
                where t.code = (storage.foldername(name))[1] and not t.revoked));
create policy ob_files_sel on storage.objects for select to anon, authenticated
  using (bucket_id = 'onboarding'
    and ((storage.foldername(name))[1] = 'contract'
      or exists (select 1 from public.teacher_onboarding t
                 where t.code = (storage.foldername(name))[1] and not t.revoked)));
create policy ob_files_staff on storage.objects for all to authenticated
  using (bucket_id = 'onboarding' and private.my_role() in ('coordinator','clerk'))
  with check (bucket_id = 'onboarding' and private.my_role() in ('coordinator','clerk'));

notify pgrst, 'reload schema';
