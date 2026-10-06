-- התלושים בפועל מהגזברות — קובץ לכל עובדת ולכל חודש (שרה, 6.10.26).
--
-- "אני רוצה שתעלה את התלושים בפועל לכל מורה, לכל חודש את התלושים שלה, כדי
-- שאני אוכל לראות אותם כל הזמן… ולכל סניף יהיה כל חודש את כל הפירוט, כולל
-- עלות שכר". עד היום התלושים הגיעו במייל כקובץ לכל סניף ולא נשמרו במערכת.
--
-- הקובץ עצמו בדלי פרטי (payslips); כאן הרישום: של מי, לאיזה חודש, ומה כתוב
-- בו — ברוטו, נטו, הפקדות המעסיק ועלות המעביד — כדי שאפשר יהיה לסכם לסניף
-- בלי לפתוח כל תלוש. המפתח הוא ת"ז וחודש, ולא שורת השכר: תלוש יכול להגיע
-- לפני שהסניף הוזן למערכת (קרית ביאליק, 9/2026).
--
-- רגיש במיוחד: תלוש מכיל ת"ז, חשבון בנק ושכר. קריאה לרכזת ולחשבת בלבד;
-- כתיבה רק מהשרת (אין מדיניות כתיבה למשתמשים).
create table if not exists public.payslip_files (
  id                uuid        primary key default gen_random_uuid(),
  month_key         text        not null,
  school_id         uuid        not null references public.schools(id) on delete cascade,
  tz_id             text,
  name              text        not null,                 -- השם כפי שהוא בתלוש
  teacher_month_id  uuid        references public.teacher_months(id) on delete set null,
  path              text        not null unique,          -- הנתיב בדלי payslips
  gross             numeric,                              -- סה"כ תשלומים
  net               numeric,                              -- נטו לתשלום
  employer_deposits numeric,                              -- הפקדות המעסיק לקופות, כפי שבתלוש
  employer_cost     numeric,                              -- ברוטו + הפקדות + ביטוח לאומי מעסיק + מס שכר (מחושב)
  source_file       text,                                 -- שם הקובץ שהתקבל מהגזברות
  uploaded_at       timestamptz not null default now()
);
create index if not exists payslip_files_month_school_idx on public.payslip_files (month_key, school_id);
create index if not exists payslip_files_tz_idx on public.payslip_files (tz_id);

alter table public.payslip_files enable row level security;

drop policy if exists payslip_files_read_staff on public.payslip_files;
create policy payslip_files_read_staff on public.payslip_files
  for select to authenticated using (private.my_role() in ('coordinator', 'clerk'));

insert into storage.buckets (id, name, public) values ('payslips', 'payslips', false)
  on conflict (id) do nothing;

drop policy if exists payslips_read_staff on storage.objects;
create policy payslips_read_staff on storage.objects for select to authenticated
  using (bucket_id = 'payslips' and private.my_role() in ('coordinator', 'clerk'));

notify pgrst, 'reload schema';
