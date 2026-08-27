-- הקישור מציג חודש אחד: זה שעובדים עליו.
--
-- קודם הוחזרו כל החודשים, והמנהלת קיבלה בורר. שני דברים רעים בזה:
-- היא יכולה למלא בטעות לחודש שכבר נסגר, וכל חודש שנוצר במסד — כולל
-- חודשי בדיקה — מופיע אצלה ברשימה. היא דיווחה שראתה "יוני 2098".
--
-- אין לה סיבה לערוך חודש קודם: מה שנסגר נסגר, ותיקון בדיעבד עובר
-- דרך הרשת. לכן מוחזר החודש הפתוח האחרון בלבד, והמסך מציג אותו
-- כטקסט ולא כבחירה.
create or replace function public.link_months(p_code text)
returns table(key text, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, m.locked
  from public.months m
  where not m.locked
    and exists (
      select 1 from private.profile_for_code(p_code) pr where pr.role = 'principal'
    )
  order by m.key desc
  limit 1;
$$;

revoke all on function public.link_months(text) from public;
grant execute on function public.link_months(text) to anon, authenticated;

notify pgrst, 'reload schema';
