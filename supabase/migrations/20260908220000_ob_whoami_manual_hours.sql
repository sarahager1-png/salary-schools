/*
  ההסכם שהעובדת חותמת עליו יקרא את התיקון הידני (שרה, 8.9).

  "יש כאלו באופק שמספר הפרטני לא נכון… טוענת שכך כתוב לה בהסכם."
  ההסכם גוזר פרטני ושהייה מהטבלה הרשמית, וכשהמספר בטבלה אינו מה
  שסוכם עם המורה — לא הייתה שום דרך לתקן את מה שהיא רואה וחותמת עליו.

  ב-8.9 נוספו `individual_hours` ו-`presence_hours` ל-`teacher_months`,
  שהמנהלת ממלאת כשהטבלה לא מתאימה. הם לא הגיעו לקישור של העובדת,
  ולכן ההסכם המשיך להציג את המספר מהטבלה. שני שדות לפלט; שאר
  הפונקציה זהה ל-20260906200000.
*/
drop function if exists public.ob_whoami(text);
create function public.ob_whoami(p_code text)
returns table(name text, tz_id text, school_name text,
              form101 jsonb, form101_signed boolean,
              has_id_doc boolean, has_salary_form boolean, has_ministry_file boolean,
              contract_signed boolean, contract_available boolean,
              bank jsonb, has_bank_doc boolean, bank_saved boolean,
              frontal_hours integer, gamul_role text,
              gender text, reform text, level text, scope_pct integer,
              has_police_doc boolean, has_form101_file boolean,
              principal_name text, has_tax_coord boolean, school_semel text,
              children_under_18 integer, age_group text,
              individual_hours smallint, presence_hours smallint)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.tz_id, coalesce(s.name, 'רשת גני חב"ד'),
         o.form101, o.form101_signed_at is not null,
         o.id_doc_path is not null, o.salary_form_path is not null, o.ministry_file_path is not null,
         o.contract_signed_at is not null,
         true,
         o.bank, o.bank_doc_path is not null, o.bank_saved_at is not null,
         tm.frontal_hours, tm.gamul_role,
         tm.gender, tm.reform, tm.level, tm.scope_pct,
         o.police_doc_path is not null, o.form101_file_path is not null,
         pr.name, o.tax_coord_path is not null, s.semel,
         tm.children_under_18, tm.age_group,
         tm.individual_hours, tm.presence_hours
  from public.teacher_onboarding o
  left join public.schools s on s.id = o.school_id
  left join lateral (
    select t.frontal_hours, t.gamul_role, t.gender, t.reform, t.level, t.scope_pct,
           t.children_under_18, t.age_group, t.individual_hours, t.presence_hours
    from public.teacher_months t
    where t.school_id = o.school_id and t.name = o.name
    order by t.month_key desc limit 1
  ) tm on true
  left join lateral (
    select t.name from public.teacher_months t
    where t.school_id = o.school_id and t.gamul_role = 'principal'
    order by t.month_key desc limit 1
  ) pr on true
  where o.code = p_code and not o.revoked;
$$;
revoke all on function public.ob_whoami(text) from public;
grant execute on function public.ob_whoami(text) to anon, authenticated;

notify pgrst, 'reload schema';
