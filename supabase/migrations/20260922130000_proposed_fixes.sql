-- תיקונים ממתינים לאישור (שרה, 22.9.26): "תמלא, אני מאשרת".
-- השרת (סקריפט/Claude) מציע תיקון לשורת עובדת — למשל ת.ז. לפי תשובת המנהלת —
-- ושרה מאשרת או דוחה במסך האישורים. האישור מוחל מהדפדפן שלה, בהרשאות שלה,
-- כך שההגנה על עמודות השכר (enforce_column_permissions) נשארת כפי שהיא.
create table if not exists public.proposed_fixes (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  teacher_month_id uuid not null references public.teacher_months(id) on delete cascade,
  patch            jsonb not null,          -- שדות בשמות האפליקציה (camelCase): {"tzId": "..."}
  source           text,                    -- מאיפה התיקון: "תשובת גב' חני אסולין, 22.9"
  status           text not null default 'pending',
  decided_at       timestamptz,
  decided_by       uuid references auth.users(id) on delete set null,
  constraint proposed_fixes_status_check check (status in ('pending', 'applied', 'rejected'))
);
create index if not exists proposed_fixes_pending_idx on public.proposed_fixes (status) where status = 'pending';

alter table public.proposed_fixes enable row level security;

drop policy if exists proposed_fixes_read_coordinator on public.proposed_fixes;
create policy proposed_fixes_read_coordinator on public.proposed_fixes
  for select to authenticated using (private.my_role() = 'coordinator');

drop policy if exists proposed_fixes_decide_coordinator on public.proposed_fixes;
create policy proposed_fixes_decide_coordinator on public.proposed_fixes
  for update to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
