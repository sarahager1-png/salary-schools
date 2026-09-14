-- "איך יתכן שאסתר רואה רק 14 עובדי הוראה בגני תקוה" (שרה, 14.9.2026)
--
-- קישורי הקליטה נוצרו בלחיצה אחת ב-4/9 וב-6/9. מי שהמנהלת הוסיפה אחר
-- כך לא קיבלה רשומת קליטה — לא הופיעה אצל חשבת השכר, ולא קיבלה קישור
-- לטופס 101. עשר כאלה ברשת, שמונה בגני תקוה.
--
-- מעכשיו: כל שורת עובד/ת חדשה (מהקישור של המנהלת, מהמערכת, מייבוא)
-- מקבלת רשומת קליטה מייד, וההודעה עם הקישור האישי נכנסת לתור הוואטסאפ
-- (queue-drain שולח). בלי טלפון — הרשומה נוצרת, ההודעה לא.
create or replace function private.ensure_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code  text;
  v_phone text;
  v_first text;
begin
  if coalesce(new.name, '') = '' then return new; end if;
  -- כבר יש רשומה לאותה עובדת בבית הספר (לפי ת.ז. או שם) — כולל שורות
  -- שנפתחות מחדש בכל חודש
  if exists (
    select 1 from public.teacher_onboarding o
    where o.school_id = new.school_id
      and ((coalesce(new.tz_id, '') <> '' and o.tz_id = new.tz_id) or o.name = new.name)
  ) then return new; end if;

  v_code := replace(gen_random_uuid()::text, '-', '');
  v_phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');
  insert into public.teacher_onboarding (school_id, name, tz_id, phone, code)
  values (new.school_id, new.name, new.tz_id, v_phone, v_code);

  if v_phone is null then return new; end if;
  v_first := split_part(new.name, ' ', 1);
  insert into public.notifications
    (kind, to_phone, to_name, body, teacher_id, month_key, status, channel, send_after)
  values
    ('onboarding_link', v_phone, new.name,
     'שלום ' || v_first || E',\n\n' ||
     E'רשת חינוך חב"ד מרכזת את מסמכי ההעסקה במקום אחד. זהו הקישור האישי שלך:\n\n' ||
     'https://salary-schools.vercel.app/?f=' || v_code || E'\n\n' ||
     E'*מה ממלאים שם (כ-10 דקות):*\n' ||
     E'1. טופס 101 — כרטיס עובד, עם חתימה דיגיטלית\n' ||
     E'2. צילום תעודת זהות\n' ||
     E'3. טופס נתוני שכר ממשרד החינוך\n' ||
     E'4. אסמכתת תיק במשרד החינוך (חובה)\n' ||
     E'5. חתימה על חוזה ההעסקה\n\n' ||
     E'*חשוב: יש להשלים תוך שבוע.* בלי טופס 101 אי אפשר לחשב את השכר, והמס ינוכה בשיעור המרבי.\n\n' ||
     E'הקישור אישי — נא לא להעביר.\nבכל שאלה אפשר לפנות לשרה הגר.\n\nרשת חינוך חב"ד',
     new.id, new.month_key, 'pending', 'whatsapp', now() + interval '5 minutes');
  return new;
exception when others then
  -- קליטה שנכשלה לעולם אינה מפילה הוספה של מנהלת
  return new;
end;
$$;

drop trigger if exists trg_ensure_onboarding on public.teacher_months;
create trigger trg_ensure_onboarding
  after insert on public.teacher_months
  for each row execute function private.ensure_onboarding();
