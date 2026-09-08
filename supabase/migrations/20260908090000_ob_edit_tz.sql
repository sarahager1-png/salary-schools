/*
  ת.ז. ניתנת לתיקון בטופס 101 (הוראת שרה, 8.9).

  עד היום השדה הוצג מהמסד ולא ניתן היה לשנותו: הקלט היה
  value={me.tz_id || form.tz} — כלומר כל הקלדה נבלעה, כי me.tz_id גבר
  עליה. מי שהוקלדה לה ת.ז. שגויה בייבוא של המנהלת לא יכלה לתקן.

  ההצלבה עם התלוש של הנהלת החשבונות נשענת על ת.ז. לפני השם (הצלבה לפי
  שם כבר נכשלה: "פריימן דבורה לאה" הותאמה בטעות ל"דבורה לאה קסיטאל"),
  ולכן ת.ז. נכונה שווה כאן יותר מנוחות.

  ob_save מקבל עכשיו גם 'tz_id'. מסונן: ספרות בלבד, 5–9 תווים — ריק או
  זבל לא ידרסו ערך קיים.
*/
create or replace function public.ob_save(p_code text, p_patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_tz text;
begin
  v_tz := nullif(regexp_replace(coalesce(p_patch ->> 'tz_id', ''), '\D', '', 'g'), '');
  if v_tz is not null and length(v_tz) not between 5 and 9 then
    raise exception 'מספר זהות חייב להיות בין 5 ל-9 ספרות';
  end if;

  update public.teacher_onboarding set
    tz_id              = coalesce(v_tz, tz_id),
    form101            = coalesce(p_patch -> 'form101', form101),
    form101_signed_at  = case when (p_patch ->> 'sign101')::boolean then now() else form101_signed_at end,
    signature_path     = coalesce(p_patch ->> 'signature_path', signature_path),
    id_doc_path        = coalesce(p_patch ->> 'id_doc_path', id_doc_path),
    salary_form_path   = coalesce(p_patch ->> 'salary_form_path', salary_form_path),
    ministry_file_path = coalesce(p_patch ->> 'ministry_file_path', ministry_file_path),
    police_doc_path    = coalesce(p_patch ->> 'police_doc_path', police_doc_path),
    form101_file_path  = coalesce(p_patch ->> 'form101_file_path', form101_file_path),
    tax_coord_path     = coalesce(p_patch ->> 'tax_coord_path', tax_coord_path),
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
