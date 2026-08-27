-- link_months החזירה רק חודשים שכבר יש בהם מורות של בית הספר.
--
-- כל עוד הקישור שימש לעדכון בלבד זה עבד: אין מורות, אין מה לעדכן.
-- מרגע שהמנהלת מוסיפה מורות בעצמה זה חוסם אותה בדיוק בהתחלה — רשימה
-- ריקה החזירה אפס חודשים, בורר החודש נשאר ריק, וההוספה נכשלה ב
-- "החודש  אינו פתוח" עם מקום ריק במקום שם.
--
-- החודשים אינם תלויים בבית ספר: הם של המערכת. מי שהקוד שלו תקף רואה
-- את כולם.
create or replace function public.link_months(p_code text)
returns table(key text, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, m.locked
  from public.months m
  where exists (
    select 1 from private.profile_for_code(p_code) pr where pr.role = 'principal'
  )
  order by m.key;
$$;

revoke all on function public.link_months(text) from public;
grant execute on function public.link_months(text) to anon, authenticated;

notify pgrst, 'reload schema';
