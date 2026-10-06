-- צילום הסימולציה לכל סניף ולכל חודש (שרה, 6.10.26: "כן").
--
-- "הסימולציה שעשיתי היא הייתה הבסיס לחישוב של ההשלמה… צריך להציג את העלות
-- בפועל מול הסימולציה". עד היום הסימולציה לא נשמרה כמספר נפרד: כשהנתונים
-- עודכנו לפי התלושים הם נכתבו על אותם שדות, וההשוואה נעשתה מול שחזור.
-- מכאן: בפתיחת כל חודש נשמרת עלות ההוראה של החודש שהסתיים כפי שיצאה
-- מהסימולציה (מחשבון המשרד + מודל עלות המעביד, בלי עלות בפועל מתלוש),
-- רגע לפני שהתלושים שלו מגיעים. הדף "תמונת מצב חודשית" קורא מכאן.
--
-- סכום לסניף בלבד — בלי שמות ובלי שכר אישי. כתיבה רק מהשרת (אין מדיניות
-- כתיבה למשתמשים); קריאה לרכזת בלבד, כמו school_finance.
create table if not exists public.month_sim_snapshot (
  school_id uuid        not null references public.schools(id) on delete cascade,
  month_key text        not null,
  sim_cost  numeric     not null,              -- עלות ההוראה לחודש לפי הסימולציה, בלי תוספת 20%
  sim_gross numeric,                            -- סך הברוטו באותו רגע
  staff     integer,                            -- מספר שורות ההוראה שנספרו
  source    text        not null default 'auto',-- auto: צולם בפתיחת החודש הבא · reconstructed: שוחזר בדיעבד
  taken_at  timestamptz not null default now(),
  primary key (school_id, month_key),
  constraint month_sim_snapshot_source_check check (source in ('auto', 'reconstructed'))
);

alter table public.month_sim_snapshot enable row level security;

drop policy if exists sim_snapshot_read_coordinator on public.month_sim_snapshot;
create policy sim_snapshot_read_coordinator on public.month_sim_snapshot
  for select to authenticated using (private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
