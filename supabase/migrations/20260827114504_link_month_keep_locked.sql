-- החודש האחרון, גם אם הוא נעול.
--
-- הגרסה הקודמת סיננה חודשים נעולים, וכשהחודש היחיד ננעל המנהלת קיבלה
-- מסך "אין עדיין עובדי הוראה" בלי מילה על כך שהחודש סגור. מה שרצינו
-- למנוע הוא ריבוי חודשים בבורר — לא את הידיעה שהחודש נעול.
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
  order by m.key desc
  limit 1;
$$;

revoke all on function public.link_months(text) from public;
grant execute on function public.link_months(text) to anon, authenticated;

notify pgrst, 'reload schema';
