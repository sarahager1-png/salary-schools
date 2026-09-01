-- ערוץ להודעה: וואטסאפ או בתוך המערכת.
--
-- הקו של המדרשת רשום על הנייד של שרה. הוא שולח יפה לכל מי שאינו היא —
-- מנהלות, מורות, חשבת השכר — אבל אליה אינו יכול להגיע: וואטסאפ אינו
-- מוסר הודעה מהמספר של עצמך אל עצמך. שתי הודעות חל"ד אמיתיות הוכיחו
-- זאת: הן נרשמו "נשלחו" ונחתו בצ'אט "הודעות לעצמי", ושרה לא ראתה דבר.
--
-- מספר ייעודי למערכת השכר עולה כסף, וקו של מערכת אחרת נפסל. לכן:
-- ההתראות של שרה נשארות בתוך המערכת, ושל כל השאר יוצאות בוואטסאפ.
-- ביום שיהיה מספר, זו החלפת ערך אחד בשורה.

alter table public.notifications
  add column if not exists channel text not null default 'whatsapp',
  add column if not exists read_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_channel_check;
alter table public.notifications
  add constraint notifications_channel_check
    check (channel in ('whatsapp', 'inapp'));

comment on column public.notifications.channel is
  'whatsapp — יוצא בתור. inapp — מוצג במסך ואינו נשלח.';
comment on column public.notifications.read_at is
  'מתי נקראה במסך. רלוונטי ל-inapp.';

-- ה-cron שואב רק את מה שאמור לצאת החוצה
drop index if exists notifications_pending_idx;
create index if not exists notifications_pending_idx
  on public.notifications (send_after)
  where status = 'pending' and channel = 'whatsapp';

notify pgrst, 'reload schema';
