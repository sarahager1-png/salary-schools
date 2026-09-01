-- העובדת רואה את פרטי הבנק שהזינה, ואם היא צירפה אישור.
--
-- בלי זה השלב היה נראה ריק בכל כניסה חוזרת, והמורה הייתה מקלידה מספר
-- חשבון שוב ושוב בלי לדעת אם נשמר.
--
-- join left על schools: מורה שנוצר לה קישור מבקשת הטפסים אינה משויכת
-- לבית ספר, וה-join הפנימי הקודם הסתיר אותה לגמרי — הקישור נראה
-- "אינו תקף" אף שהוא תקין.
-- שינוי סוג ההחזרה מחייב מחיקה תחילה; הפונקציה נוצרת מחדש מיד.
drop function if exists public.ob_whoami(text);
create function public.ob_whoami(p_code text)
returns table(name text, tz_id text, school_name text,
              form101 jsonb, form101_signed boolean,
              has_id_doc boolean, has_salary_form boolean, has_ministry_file boolean,
              contract_signed boolean, contract_available boolean,
              bank jsonb, has_bank_doc boolean, bank_saved boolean)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.tz_id, coalesce(s.name, 'רשת חינוך חב"ד'),
         o.form101, o.form101_signed_at is not null,
         o.id_doc_path is not null, o.salary_form_path is not null, o.ministry_file_path is not null,
         o.contract_signed_at is not null,
         exists (select 1 from storage.objects ob
                 where ob.bucket_id = 'onboarding' and ob.name = 'contract/contract.pdf'),
         o.bank, o.bank_doc_path is not null, o.bank_saved_at is not null
  from public.teacher_onboarding o
  left join public.schools s on s.id = o.school_id
  where o.code = p_code and not o.revoked;
$$;

revoke all on function public.ob_whoami(text) from public;
grant execute on function public.ob_whoami(text) to anon, authenticated;

notify pgrst, 'reload schema';
