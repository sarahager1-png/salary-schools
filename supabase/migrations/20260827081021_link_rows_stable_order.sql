-- שורות המנהלת חזרו בסדר אקראי.
--
-- בלי ORDER BY, Postgres מחזיר את השורות בסדר שנוח לו — והוא משתנה
-- אחרי כל עדכון. המנהלת ראתה את הרשימה מתערבבת בכל שמירה, וקל מאוד
-- לפתוח עריכה על המורה הלא נכונה. שורת המנהלת ראשונה, אחריה לפי שם.
create or replace function public.link_rows(p_code text, p_month text)
returns setof public.teacher_months
language sql stable security definer set search_path = ''
as $$
  select tm.*
  from private.profile_for_code(p_code) pr
  join public.teacher_months tm
    on tm.month_key = p_month and tm.school_id = pr.school_id
  where pr.role = 'principal'
  order by (tm.gamul_role = 'principal') desc, tm.name;
$$;

revoke all on function public.link_rows(text, text) from public;
grant execute on function public.link_rows(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
