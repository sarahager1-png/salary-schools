-- "אין לי איפה לחשב" (שרה, 3.9): תור בקשות חישוב מהמסך. שרה לוחצת
-- "חשב" על שורה; שירות מקומי (sim-watcher) מריץ את מחשבון משרד
-- החינוך בדפדפן אמיתי וכותב את התוצאה לבקשה בלבד — את השכר עצמו
-- שומר הדפדפן של שרה, בהרשאות שלה. השרת לעולם אינו כותב שכר.
create table public.sim_requests (
  id               uuid primary key default gen_random_uuid(),
  teacher_month_id uuid not null references public.teacher_months(id) on delete cascade,
  status           text not null default 'pending'
                   check (status in ('pending', 'running', 'done', 'failed')),
  result_gross     integer,
  error            text,
  requested_by     uuid,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);
create index sim_requests_pending on public.sim_requests (status, created_at);

alter table public.sim_requests enable row level security;
grant select, insert, update, delete on public.sim_requests to authenticated;

-- שרה בלבד: היא המבקשת והיא הקוראת. השירות המקומי עובד במפתח השרת.
create policy simreq_coordinator on public.sim_requests
  for all
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');
