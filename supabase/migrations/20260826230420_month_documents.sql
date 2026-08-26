-- מסמכים מהנהלת החשבונות.
--
-- השכר בפועל רץ במערכת של משרד הנהלת החשבונות, לא כאן. אסתר מקבלת ממנה
-- דוח שכר, סיכום עלות מעביד, תלושים — ועד עכשיו לא היה לה איפה לשים
-- אותם ליד החודש שהם שייכים לו. הקובץ מצורף לחודש, ואם הוא של בית ספר
-- אחד — גם לבית הספר.
--
-- הקבצים עצמם ב-Storage, בדלי פרטי. אין כתובת ציבורית: כל פתיחה עוברת
-- דרך signed URL קצר-מועד, ורק למי שהמדיניות למטה מתירה לו.

create table public.month_documents (
  id          uuid primary key default gen_random_uuid(),
  month_key   text not null references public.months(key) on delete cascade,
  school_id   uuid references public.schools(id) on delete set null,
  path        text not null unique,          -- המפתח ב-Storage
  file_name   text not null,                 -- השם המקורי, לתצוגה
  size_bytes  integer,
  note        text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index month_documents_month_idx on public.month_documents (month_key);

alter table public.month_documents enable row level security;

-- הרשת, חשבת השכר והמאשרות רואות. מנהלות בית ספר — לא: המסמכים מכילים
-- שכר של עובדות בשמן, וזה בדיוק מה שמוסתר מהן בכל מקום אחר.
create policy docs_select on public.month_documents
  for select to authenticated
  using (private.my_role() in ('coordinator', 'clerk', 'network'));

create policy docs_insert on public.month_documents
  for insert to authenticated
  with check (private.my_role() in ('coordinator', 'clerk')
              and uploaded_by = (select auth.uid()));

-- מי שהעלתה מוחקת את שלה; השליח מוחק הכול
create policy docs_delete on public.month_documents
  for delete to authenticated
  using (private.my_role() = 'coordinator' or uploaded_by = (select auth.uid()));

grant select, insert, delete on public.month_documents to authenticated;

-- ── הדלי ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('payroll-docs', 'payroll-docs', false, 26214400)   -- 25MB
on conflict (id) do nothing;

create policy "payroll docs read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payroll-docs' and private.my_role() in ('coordinator', 'clerk', 'network'));

create policy "payroll docs write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payroll-docs' and private.my_role() in ('coordinator', 'clerk'));

create policy "payroll docs delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payroll-docs'
         and (private.my_role() = 'coordinator' or owner = (select auth.uid())));

notify pgrst, 'reload schema';
