-- מי מאשרת כל בית ספר.
--
-- השם "רינה אלהרר" היה מקודד קשיח בממשק. מענדי כהן (עפולה) וחנה
-- אברומוביץ (רעננה) ראו בכותרת שלהם "רינה אלהרר · אישור רשתי", והשליח
-- הופנה אליה גם על בתי ספר שהיא חסומה מהם. הכלל עצמו כבר קיים במסד
-- (approves_school) — הממשק פשוט לא יכול היה לשאול אותו: פרופילים
-- נראים רק לבעליהם ולשליח.
--
-- הפונקציה חושפת את המינימום: לכל מאשר רשתי — שמו ובית הספר שלו (או
-- null למאשרת הכללית). בלי מיילים, בלי מזהי משתמש. השמות ממילא מוצגים
-- בכל תג "אצל …" במערכת.
create or replace function public.school_approvers()
returns table(school_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id, p.full_name
  from public.profiles p
  where p.role = 'network'
  order by p.school_id nulls last, p.full_name;
$$;

revoke all on function public.school_approvers() from public, anon;
grant execute on function public.school_approvers() to authenticated;

notify pgrst, 'reload schema';
