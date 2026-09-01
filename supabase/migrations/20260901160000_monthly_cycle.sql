-- המחזור החודשי — דיווח, אישור, תשלום.
--
-- המערכת נבנתה סביב הסימולטור: מסך שמנווט למחשבון של משרד החינוך, שתי
-- עמודות ברוטו, והפער ביניהן כתוספת בית חב"ד. השבוע נבדקו 28 הסימולציות
-- הקיימות מול המחשבון: 8 התאימו. הפערים לא היו בחישוב אלא בקלט.
--
-- שרה הכריעה שהכיוון עצמו שגוי (1.9.2026): הסימולטור יורד, הפער בין
-- המסלולים אינו עניינה, וחשבת השכר מזינה ברוטו ועלות מעביד. מה שהמערכת
-- מנהלת מעכשיו הוא מחזור חודשי עם מועדים אמיתיים:
--
--   דיווח המנהלת עד ה-5 → אישור שרה → תשלום למי שהשלימה עד ה-6.
--
-- העמודות הישנות אינן נמחקות כאן. הן מפסיקות להיקרא, ונמחקות במיגרציה
-- נפרדת אחרי חודש עבודה תקין — מחיקה מיידית הופכת כל טעות לבלתי הפיכה.

-- ── שדות המחזור על השורה החודשית ─────────────────────────────────────

alter table public.teacher_months
  -- תוספת בית חב"ד: היה הפער בין שתי הסימולציות, ומעכשיו מספר שחשבת
  -- השכר מזינה. אינו פנסיוני ואינו נושא קרן השתלמות, כמו קודם.
  add column if not exists chabad_supp    integer,
  add column if not exists gross_set_by   uuid,
  add column if not exists gross_set_at   timestamptz,
  -- מתי המנהלת דיווחה על החודש, ואם זה היה אחרי המועד. "נסגר אבל מסומן"
  -- (הכרעת שרה): היא עדיין יכולה לדווח, אבל השורה אינה עוברת לתשלום
  -- בלי אישור מפורש.
  add column if not exists reported_at    timestamptz,
  add column if not exists late_report    boolean not null default false,
  add column if not exists payroll_ready  boolean not null default false;

alter table public.teacher_months
  drop constraint if exists teacher_months_chabad_supp_check;
alter table public.teacher_months
  add constraint teacher_months_chabad_supp_check
    check (chabad_supp is null or chabad_supp >= 0);

comment on column public.teacher_months.chabad_supp   is 'תוספת בית חב"ד — מוזנת בידי חשבת השכר. לא פנסיונית.';
comment on column public.teacher_months.reported_at   is 'מתי המנהלת דיווחה על החודש הזה';
comment on column public.teacher_months.late_report   is 'הדיווח הגיע אחרי מועד הדיווח של החודש';
comment on column public.teacher_months.payroll_ready is 'אושר ועבר לשכר';

-- ── מועדי החודש ──────────────────────────────────────────────────────
-- ה-5 לדיווח, ה-6 להשלמת פרטי המורה. נשמרים כתאריכים ולא כמספרים כדי
-- שאפשר יהיה לדחות חודש מסוים בלי לשנות קוד.

alter table public.months
  add column if not exists report_due date,
  add column if not exists submit_due date,
  add column if not exists closed_at  timestamptz;

comment on column public.months.report_due is 'המועד האחרון לדיווח המנהלות — ברירת מחדל ה-5 בחודש';
comment on column public.months.submit_due is 'המועד האחרון להשלמת פרטי המורה — ברירת מחדל ה-6';

-- מילוי לחודשים שכבר נפתחו: ה-5 וה-6 של אותו חודש
do $$
begin
  perform set_config('app.via_link', '1', true);
  update public.months
     set report_due = coalesce(report_due, (key || '-05')::date),
         submit_due = coalesce(submit_due, (key || '-06')::date)
   where key ~ '^\d{4}-\d{2}$';
end $$;

-- ── תור ההודעות ──────────────────────────────────────────────────────
-- כל שליחה עוברת דרך כאן: המסך אינו מדבר עם Green API, וה-cron מרוקן.
-- כך יש היסטוריה, ניסיון חוזר, ומקום אחד לראות מה נשלח ומה נכשל.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  to_phone    text not null,
  to_name     text,
  body        text not null,
  teacher_id  uuid references public.teacher_months(id) on delete set null,
  month_key   text,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  error       text,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint notifications_status_check check (status in ('pending', 'sent', 'failed', 'cancelled'))
);

comment on table public.notifications is
  'תור ההודעות היוצאות. נכתב מהמערכת, מרוקן ב-cron. שליחה ישירה מהמסך אינה אפשרית.';

-- ה-cron שואב את מה שממתין ובשל; אינדקס חלקי כי רוב השורות כבר נשלחו
create index if not exists notifications_pending_idx
  on public.notifications (send_after)
  where status = 'pending';

alter table public.notifications enable row level security;

-- הצוות רואה את התור; הכתיבה והשליחה הן של השרת (service role), שאינו
-- עובר RLS. מנהלת בית ספר אינה רואה הודעות של אחרות.
drop policy if exists notifications_read_staff on public.notifications;
create policy notifications_read_staff on public.notifications
  for select to authenticated
  using (private.my_role() in ('coordinator', 'clerk'));

notify pgrst, 'reload schema';
