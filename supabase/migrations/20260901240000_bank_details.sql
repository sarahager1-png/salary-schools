-- פרטי בנק בקליטת עובדת ההוראה.
--
-- "יש צורך בפרטי בנק" (שרה, 1.9). בלעדיהם השכר אינו יכול לצאת, וזה
-- היה השלב היחיד שנשאר מחוץ לקליטה המקוונת — המורות מסרו אותם בנייר,
-- בוואטסאפ או בטלפון, וכל אחד מהמסלולים האלה מפזר מספרי חשבון.
--
-- הפרטים נשמרים כ-jsonb ולא בעמודות: מספרי בנק וסניף אינם מספרים
-- שמחשבים אלא מחרוזות שמעתיקים, וההעברה לחשבת השכר היא של הכול יחד.
--
-- bank_doc_path — אישור ניהול חשבון או צ׳ק מבוטל. הוא הראיה, והוא זה
-- שמונע העברה לחשבון שהוקלד בטעות.

alter table public.teacher_onboarding
  add column if not exists bank          jsonb,
  add column if not exists bank_doc_path text,
  add column if not exists bank_saved_at timestamptz;

comment on column public.teacher_onboarding.bank is
  'פרטי חשבון הבנק: bank, branch, account, owner';
comment on column public.teacher_onboarding.bank_doc_path is
  'אישור ניהול חשבון או צ׳ק מבוטל — הראיה לפרטים שהוקלדו';

-- ob_save מקבלת אותם, כמו כל שאר שלבי הקליטה
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
    bank               = coalesce(p_patch -> 'bank', bank),
    bank_doc_path      = coalesce(p_patch ->> 'bank_doc_path', bank_doc_path),
    bank_saved_at      = case when p_patch ? 'bank' then now() else bank_saved_at end,
    last_used_at = now(), updated_at = now()
  where id = o.id;
end;
$$;

revoke all on function public.ob_save(text, jsonb) from public;
grant execute on function public.ob_save(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
