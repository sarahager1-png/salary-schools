-- שורות התלוש המלאות ("לא רואים את התלוש רק עלויות", שרה 3.9):
-- רכיבי העולם הישן כפי שמחשבון המשרד מפיק אותם, שורה-שורה, לכל
-- מורה. נלכדות בהרצה ומתרעננות בכל חישוב-מחדש של ה-watcher.
create table public.slip_lines (
  teacher_month_id uuid primary key references public.teacher_months(id) on delete cascade,
  lines            jsonb not null,   -- [{code, label, amount, qty}]
  gross            integer not null, -- סך הכל ברוטו כללי של הרכיבים
  computed_at      timestamptz not null default now()
);

alter table public.slip_lines enable row level security;
grant select on public.slip_lines to authenticated;

-- רואות מי שרואות שכר: הרשת וחשבת השכר. הכתיבה במפתח השרת בלבד.
create policy slip_lines_select on public.slip_lines
  for select to authenticated
  using (private.my_role() in ('coordinator', 'clerk'));
