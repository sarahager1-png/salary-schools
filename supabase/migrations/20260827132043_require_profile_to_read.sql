-- קריאת רשימת בתי הספר והחודשים דורשת פרופיל.
--
-- המדיניות הייתה `to authenticated using (true)`. כל עוד ההרשמה העצמית
-- פתוחה, "authenticated" כולל כל אדם באינטרנט שפתח חשבון — והוא קיבל את
-- רשימת שמונת בתי הספר ואת החודשים הפתוחים. לא שכר ולא פרטי עובדות, אבל
-- גם לא משהו שצריך להיות שם.
--
-- private.my_role() מחזיר null למי שאין לו פרופיל. משתמשי המערכת האמיתיים
-- — שליחות, חשבת, מנהלות, רכזת — כולם עם פרופיל, ולהם דבר לא משתנה.
-- גישת הקישור אינה עוברת כאן בכלל: פונקציות link_* הן SECURITY DEFINER.
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools
  for select to authenticated
  using (private.my_role() is not null);

drop policy if exists months_read on public.months;
create policy months_read on public.months
  for select to authenticated
  using (private.my_role() is not null);

notify pgrst, 'reload schema';
