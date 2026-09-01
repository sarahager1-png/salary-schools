-- עלות הוראה מול תקציב — לעיני שרה בלבד (בקשתה, 2.9.2026):
-- "תקציב הכנסות משרד החינוך פחות ייעול פחות הוצאות עלות שכר,
--  בדף נפרד לעיני בלבד."
--
-- תקציב וייעול הם מספרים שנתיים ששרה מקלידה; עלות השכר נמשכת
-- מהמערכת. הטבלה כולה מאחורי RLS של coordinator — גם חשבת השכר
-- וגם המנהלות לא רואות אותה, לא בדף ולא ב-API.
create table public.school_finance (
  school_id       uuid primary key references public.schools(id) on delete cascade,
  ministry_budget numeric check (ministry_budget is null or ministry_budget >= 0),
  yieul           numeric check (yieul is null or yieul >= 0),
  note            text,
  updated_at      timestamptz not null default now()
);

alter table public.school_finance enable row level security;
grant select, insert, update, delete on public.school_finance to authenticated;

create policy fin_coordinator_only on public.school_finance
  for all
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');
