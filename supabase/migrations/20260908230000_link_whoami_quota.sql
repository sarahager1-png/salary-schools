/*
  תקן השעות של בית הספר מגיע לקישור של המנהלת (שרה, 8.9).

  "חשוב שלא יעלה על תקן השעות" — ולכן מסך האישור צריך לדעת מהו התקן.
  הוא נגזר במבט-רשת (כיתות × שעות לכיתה + פיצול − ייעול) ונשמר
  ב-`schools.hours_quota`.

  "מי שיש פחות אל תציין, רק מי שיש יותר; אם תוסיף ותגע בגג תציין" —
  ההצגה שקטה כל עוד השעות מתחת לתקן, ומופיעה ברגע שנוגעים בו או
  עוברים אותו. השדה עצמו נשלח תמיד; ההחלטה מה להראות היא של המסך.
*/
-- שינוי טיפוס הפלט מחייב drop (הוספת עמודה ל-returns table)
drop function if exists public.link_whoami(text);
create function public.link_whoami(p_code text)
returns table(full_name text, role public.app_role, school_id uuid,
              school_name text, gender text, hours_quota integer)
language sql stable security definer set search_path = ''
as $$
  select pr.full_name, pr.role, pr.school_id, s.name, pr.gender, s.hours_quota
  from private.profile_for_code(p_code) pr
  left join public.schools s on s.id = pr.school_id;
$$;
revoke all on function public.link_whoami(text) from public;
grant execute on function public.link_whoami(text) to anon, authenticated;

notify pgrst, 'reload schema';
