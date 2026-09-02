-- שיפורי הקליטה (שרה, 3.9):
--   1. אסמכתת תיק במשרד יורדת — אם יש נתוני שכר, יש תיק.
--   2. לגברים: אישור משטרה על היעדר עבירות מין (חוק למניעת העסקה).
--   3. טופס 101 חתום מוכן מתקבל כקובץ (רשות).
--   4. שמירה שלב-שלב: form101 נשמר גם בלי חתימה (ob_save כבר יודע).
alter table public.teacher_onboarding
  add column if not exists police_doc_path text,
  add column if not exists form101_file_path text;

create or replace function public.ob_save(p_code text, p_patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.teacher_onboarding set
    form101            = coalesce(p_patch -> 'form101', form101),
    form101_signed_at  = case when (p_patch ->> 'sign101')::boolean then now() else form101_signed_at end,
    signature_path     = coalesce(p_patch ->> 'signature_path', signature_path),
    id_doc_path        = coalesce(p_patch ->> 'id_doc_path', id_doc_path),
    salary_form_path   = coalesce(p_patch ->> 'salary_form_path', salary_form_path),
    ministry_file_path = coalesce(p_patch ->> 'ministry_file_path', ministry_file_path),
    police_doc_path    = coalesce(p_patch ->> 'police_doc_path', police_doc_path),
    form101_file_path  = coalesce(p_patch ->> 'form101_file_path', form101_file_path),
    contract_signature_path = coalesce(p_patch ->> 'contract_signature_path', contract_signature_path),
    contract_signed_at = case when (p_patch ->> 'sign_contract')::boolean then now() else contract_signed_at end,
    bank               = coalesce(p_patch -> 'bank', bank),
    bank_doc_path      = coalesce(p_patch ->> 'bank_doc_path', bank_doc_path),
    bank_saved_at      = case when p_patch ? 'bank' then now() else bank_saved_at end,
    updated_at         = now(),
    last_used_at       = now()
  where code = p_code and not revoked;
  if not found then raise exception 'הקישור אינו תקף'; end if;
end;
$$;
revoke all on function public.ob_save(text, jsonb) from public;
grant execute on function public.ob_save(text, jsonb) to anon, authenticated;

drop function if exists public.ob_whoami(text);
create function public.ob_whoami(p_code text)
returns table(name text, tz_id text, school_name text,
              form101 jsonb, form101_signed boolean,
              has_id_doc boolean, has_salary_form boolean, has_ministry_file boolean,
              contract_signed boolean, contract_available boolean,
              bank jsonb, has_bank_doc boolean, bank_saved boolean,
              frontal_hours integer, gamul_role text,
              gender text, reform text, level text, scope_pct integer,
              has_police_doc boolean, has_form101_file boolean)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.tz_id, coalesce(s.name, 'רשת חינוך חב"ד'),
         o.form101, o.form101_signed_at is not null,
         o.id_doc_path is not null, o.salary_form_path is not null, o.ministry_file_path is not null,
         o.contract_signed_at is not null,
         true,
         o.bank, o.bank_doc_path is not null, o.bank_saved_at is not null,
         tm.frontal_hours, tm.gamul_role,
         tm.gender, tm.reform, tm.level, tm.scope_pct,
         o.police_doc_path is not null, o.form101_file_path is not null
  from public.teacher_onboarding o
  left join public.schools s on s.id = o.school_id
  left join lateral (
    select t.frontal_hours, t.gamul_role, t.gender, t.reform, t.level, t.scope_pct
    from public.teacher_months t
    where t.school_id = o.school_id and t.name = o.name
    order by t.month_key desc limit 1
  ) tm on true
  where o.code = p_code and not o.revoked;
$$;
revoke all on function public.ob_whoami(text) from public;
grant execute on function public.ob_whoami(text) to anon, authenticated;
