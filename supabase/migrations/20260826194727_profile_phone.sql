-- הטלפון כזהות כניסה.
--
-- מספר טלפון לבדו אינו סוד — הוא בכל קבוצת וואטסאפ וברשימת אנשי הקשר
-- של כל אחד. לכן הוא מזהה בלבד, ולא מפתח: הכניסה תדרוש גם קוד חד־פעמי
-- שנשלח למכשיר עצמו, וזה מה שמוכיח שמי שמקליד הוא בעל המספר.

alter table public.profiles add column phone text;

-- מספר אחד לאדם אחד. שני פרופילים עם אותו מספר יהפכו את הזיהוי לדו-משמעי.
create unique index profiles_phone_key on public.profiles (phone) where phone is not null;

-- E.164 בלבד: +972 ואחריו הספרות, בלי מקפים ובלי אפס מוביל. הנרמול
-- נעשה בשכבה שמעל, כדי שלא יישמרו שתי צורות של אותו מספר.
alter table public.profiles add constraint phone_e164
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.profiles.phone is
  'מזהה כניסה בלבד. הסוד הוא הקוד החד־פעמי שנשלח למספר, לא המספר עצמו.';
