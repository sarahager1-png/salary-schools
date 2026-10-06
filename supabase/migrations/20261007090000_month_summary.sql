-- סגירת חודש — תמונה קפואה של "תמונת מצב חודשית" (שרה, 6.10.26: "מאשרת").
--
-- עד היום התמונה של חודש שעבר חושבה מחדש בכל פתיחה, מהנתונים הנוכחיים:
-- תיקון בשורת שכר של ספטמבר, שינוי בסכום שסוכם או בתקציב — שינו בדיעבד את
-- מה שהמנהל כבר ראה. מכאן: כששרה סוגרת חודש, נשמרת לכל סניף השורה כפי
-- שהוצגה באותו רגע, והדף קורא ממנה לחודש סגור.
--
-- נשמרים סכומים לסניף בלבד (אותו מבנה שהדף מציג) — בלי שמות ובלי שכר אישי.
-- תקבולים והעברות שנרשמים אחרי הסגירה ממשיכים להתעדכן: הם אינם חלק
-- מהתמונה הקפואה אלא השלמה שלה.
--
-- כתיבה רק מהשרת (אין מדיניות כתיבה למשתמשים); קריאה לרכזת בלבד.
create table if not exists public.month_summary (
  month_key text        not null,
  school_id uuid        not null references public.schools(id) on delete cascade,
  data      jsonb       not null,               -- שורת הסניף כפי שהוצגה ברגע הסגירה
  closed_at timestamptz not null default now(),
  closed_by uuid,
  primary key (month_key, school_id)
);

alter table public.month_summary enable row level security;

drop policy if exists month_summary_read_coordinator on public.month_summary;
create policy month_summary_read_coordinator on public.month_summary
  for select to authenticated using (private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
