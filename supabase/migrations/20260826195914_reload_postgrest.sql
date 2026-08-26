-- link_months נכתבה קודם לקובץ מיגרציה שיצא ריק, ולכן היא סומנה כמיושמת
-- בלי שנוצרה בפועל. כאן היא נוצרת באמת.
--
-- מי שנכנס בקישור אינו רואה את טבלת החודשים — היא סגורה ל-anon לגמרי.
-- בלי הפונקציה הזו המסך שלה אינו יודע איזה חודש להציג, ונאלץ לנחש את
-- החודש הקלנדרי — שלרוב אינו החודש הפעיל.
create or replace function public.link_months(p_code text)
returns table(key text, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.key, m.locked
  from private.profile_for_code(p_code) pr
  join public.teacher_months tm on tm.school_id = pr.school_id
  join public.months m on m.key = tm.month_key
  where pr.role = 'principal'
  order by m.key;
$$;

revoke all on function public.link_months(text) from public;
grant execute on function public.link_months(text) to anon, authenticated;

-- PostgREST שומר מטמון של הפונקציות שהוא מכיר. בלי ההודעה הזו קריאה
-- לפונקציה חדשה חוזרת "Could not find the function in the schema cache".
notify pgrst, 'reload schema';
