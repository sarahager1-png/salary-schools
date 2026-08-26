-- למשתמש בלי פרופיל, my_role() מחזירה NULL.
-- הביטוי `NULL <> 'network'` אינו TRUE אלא NULL, ולכן ה-CASE נפל לענף
-- האחרון ונתן גישה לכל בית ספר שאין לו מאשר ייעודי.
-- `is distinct from` מטפל ב-NULL כערך, ולא כאלמוני.

create or replace function private.approves_school(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.my_role() is distinct from 'network' then false
    when private.my_school() is not null then p_school = private.my_school()
    else not private.has_dedicated_approver(p_school)
  end;
$$;
