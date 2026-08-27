-- מין, כדי לפנות לאדם בלשון הנכונה.
--
-- כל המערכת נכתבה בלשון נקבה — "הוסיפי", "מנהלת בית ספר" — כי כל
-- המנהלות שהוזנו הן נשים. בעפולה המנהל גבר, והמסך שאומר לו "הוסיפי"
-- אומר לו, בלי לומר זאת, שהמערכת לא נכתבה בשבילו.
--
-- ברירת המחדל היא נקבה: זה הרוב המובהק ברשת, ולכן שגיאה נדירה יותר.
alter table public.profiles
  add column gender text not null default 'f' check (gender in ('f', 'm'));

comment on column public.profiles.gender is
  'f | m — לצורך לשון הפנייה בלבד. אינו משפיע על הרשאות.';

-- הקישור צריך לדעת למי הוא מדבר.
-- create or replace אינו יכול לשנות טיפוס החזרה של פונקציה קיימת,
-- ולכן מוחקים תחילה. אין לה תלויות — היא נקראת מהלקוח בלבד.
drop function if exists public.link_whoami(text);

create function public.link_whoami(p_code text)
returns table(full_name text, role public.app_role, school_id uuid, school_name text, gender text)
language sql stable security definer set search_path = ''
as $$
  select pr.full_name, pr.role, pr.school_id, s.name, pr.gender
  from private.profile_for_code(p_code) pr
  left join public.schools s on s.id = pr.school_id;
$$;

revoke all on function public.link_whoami(text) from public;
grant execute on function public.link_whoami(text) to anon, authenticated;

notify pgrst, 'reload schema';
