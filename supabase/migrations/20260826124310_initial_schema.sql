-- ═══════════════════════════════════════════════════════════════
-- מערכת שכר מורים — רשת חינוך חב"ד
-- סכימה ראשונית: בתי ספר, חודשים, שורות שכר, פרופילים והרשאות.
--
-- ההרשאות נאכפות בשני מישורים:
--   RLS      — אילו שורות כל תפקיד רואה ונוגע בהן
--   טריגר    — אילו עמודות כל תפקיד רשאי לשנות
-- הפרדה בין השניים הכרחית כאן, כי הגבלת עמודות אינה חלק מ-RLS.
-- ═══════════════════════════════════════════════════════════════

create type public.app_role as enum ('coordinator', 'clerk', 'principal', 'network');

-- ── סכימה פרטית לפונקציות עזר. לא חשופה ל-Data API ──────────
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ═══ בתי ספר ═══════════════════════════════════════════════
create table public.schools (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  city              text,
  reform            text not null default 'ofek' check (reform in ('ofek', 'pre')),
  hours_quota       integer check (hours_quota is null or hours_quota > 0),
  principal_email   text,
  coordinator_email text,
  created_at        timestamptz not null default now()
);

-- ═══ חודשי תקציב ═══════════════════════════════════════════
create table public.months (
  key       text primary key check (key ~ '^\d{4}-\d{2}$'),
  opened_at timestamptz not null default now(),
  locked    boolean not null default false
);

-- ═══ שורת שכר: עובדת אחת בחודש אחד ═════════════════════════
create table public.teacher_months (
  id                    uuid primary key default gen_random_uuid(),
  month_key             text not null references public.months(key) on delete cascade,
  school_id             uuid not null references public.schools(id) on delete cascade,

  -- זהות
  name                  text not null,
  tz_id                 text,
  email                 text,

  -- נתוני שכר שהמנהלת מזינה
  reform                text not null default 'ofek' check (reform in ('ofek', 'pre')),
  level                 text not null default 'elementary' check (level in ('elementary', 'middle', 'high')),
  grade                 text,
  degree                text,
  seniority             integer not null default 0  check (seniority between 0 and 60),
  frontal_hours         integer not null default 26 check (frontal_hours between 0 and 60),
  scope_pct             integer not null default 100 check (scope_pct between 0 and 200),
  gamul_role            text not null default 'none',
  age_group             text not null default 'none',
  is_temp               boolean not null default false,
  start_date            date,
  end_date              date,
  children_under_18     integer not null default 0 check (children_under_18 between 0 and 20),

  -- שדות חודשיים
  absence_days          integer not null default 0 check (absence_days >= 0),
  mm_hours              integer not null default 0 check (mm_hours >= 0),
  mm_for                text,
  monthly_extras        integer not null default 0 check (monthly_extras >= 0),

  -- סימולציה ותשלום. חשבת השכר בלבד.
  official_gross        integer check (official_gross is null or official_gross >= 0),
  official_gross_pre    integer check (official_gross_pre is null or official_gross_pre >= 0),
  agreed_gross          integer check (agreed_gross is null or agreed_gross >= 0),
  actual_employer_cost  integer check (actual_employer_cost is null or actual_employer_cost >= 0),

  -- זרימת האישורים
  changed_at            timestamptz,
  snapshot              jsonb,
  approved              boolean not null default false,
  approved_at           timestamptz,
  approved_by           uuid references auth.users(id) on delete set null,
  net_approved          boolean not null default false,
  net_approved_at       timestamptz,
  net_approved_by       uuid references auth.users(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index teacher_months_month_school_idx on public.teacher_months (month_key, school_id);
create index teacher_months_school_idx       on public.teacher_months (school_id);

-- ═══ פרופילים — מי המשתמש, מה תפקידו ולאיזה בית ספר ════════
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       public.app_role not null,
  school_id  uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now(),
  -- מנהלת חייבת להיות משויכת לבית ספר; שאר התפקידים רשתיים
  constraint principal_needs_school check (role <> 'principal' or school_id is not null)
);

-- ═══ יומן אירועים — מי עשה מה ומתי ═════════════════════════
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid references auth.users(id) on delete set null,
  actor_role public.app_role,
  row_id     uuid,
  month_key  text,
  action     text not null,
  detail     jsonb
);
create index audit_log_row_idx on public.audit_log (row_id, at desc);

-- ═══════════════════════════════════════════════════════════
-- פונקציות עזר. SECURITY DEFINER כדי לקרוא את profiles בלי
-- להיתקל ב-RLS של profiles עצמה, בסכימה שאינה חשופה.
-- ═══════════════════════════════════════════════════════════
create or replace function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.my_school()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id from public.profiles p where p.id = (select auth.uid());
$$;

revoke all on function private.my_role()   from public, anon, authenticated;
revoke all on function private.my_school() from public, anon, authenticated;
grant execute on function private.my_role()   to authenticated;
grant execute on function private.my_school() to authenticated;

-- ═══════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════
alter table public.schools        enable row level security;
alter table public.months         enable row level security;
alter table public.teacher_months enable row level security;
alter table public.profiles       enable row level security;
alter table public.audit_log      enable row level security;

-- ── profiles: כל אחד רואה את עצמו; השליח רואה את כולם ──────
create policy profiles_select_self on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or private.my_role() = 'coordinator');

create policy profiles_manage_by_coordinator on public.profiles
  for all to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

-- ── schools: כולם קוראים; השליח בלבד כותב ──────────────────
create policy schools_read on public.schools
  for select to authenticated using (true);

create policy schools_write on public.schools
  for all to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

-- ── months: כולם קוראים; השליח בלבד פותח וסוגר ─────────────
create policy months_read on public.months
  for select to authenticated using (true);

create policy months_write on public.months
  for all to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

-- ── teacher_months ─────────────────────────────────────────
-- מנהלת: בית הספר שלה בלבד. השאר: כל הרשת.
create policy tm_select on public.teacher_months
  for select to authenticated
  using (
    private.my_role() in ('coordinator', 'clerk', 'network')
    or (private.my_role() = 'principal' and school_id = private.my_school())
  );

-- הוספה ומחיקה: השליח, או מנהלת בבית ספר שלה
create policy tm_insert on public.teacher_months
  for insert to authenticated
  with check (
    private.my_role() = 'coordinator'
    or (private.my_role() = 'principal' and school_id = private.my_school())
  );

create policy tm_delete on public.teacher_months
  for delete to authenticated
  using (private.my_role() = 'coordinator');

-- עדכון: מי נוגע באיזו שורה. אילו עמודות — נאכף בטריגר.
create policy tm_update on public.teacher_months
  for update to authenticated
  using (
    private.my_role() in ('coordinator', 'clerk', 'network')
    or (private.my_role() = 'principal' and school_id = private.my_school())
  )
  with check (
    private.my_role() in ('coordinator', 'clerk', 'network')
    or (private.my_role() = 'principal' and school_id = private.my_school())
  );

-- ── audit_log: קריאה לשליח ולרינה; כתיבה דרך טריגר בלבד ────
create policy audit_read on public.audit_log
  for select to authenticated
  using (private.my_role() in ('coordinator', 'network'));

-- ═══════════════════════════════════════════════════════════
-- אכיפת עמודות לפי תפקיד.
-- RLS קובע אילו שורות; זה קובע אילו שדות בתוכן.
-- ═══════════════════════════════════════════════════════════
create or replace function private.enforce_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.app_role := private.my_role();
  changed text[] := '{}';
  col text;
begin
  if r is null then
    raise exception 'למשתמש אין פרופיל במערכת';
  end if;

  -- חודש נעול — רק השליח יכול לפתוח אותו מחדש
  if exists (select 1 from public.months m where m.key = new.month_key and m.locked)
     and r <> 'coordinator' then
    raise exception 'החודש % נעול', new.month_key;
  end if;

  -- אילו עמודות באמת השתנו
  select array_agg(key) into changed
  from jsonb_each_text(to_jsonb(old)) o
  where o.value is distinct from (to_jsonb(new) ->> o.key);

  if changed is null then return new; end if;

  if r = 'principal' then
    -- המנהלת מזינה את פרטי המורה ואת השעות. לא את הכסף ולא את האישורים.
    foreach col in array changed loop
      if col in ('official_gross', 'official_gross_pre', 'agreed_gross',
                 'actual_employer_cost', 'approved', 'approved_at', 'approved_by',
                 'net_approved', 'net_approved_at', 'net_approved_by', 'school_id') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'clerk' then
    -- חשבת השכר מזינה סימולציות ועלות בפועל בלבד
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'actual_employer_cost', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'network' then
    -- רינה מאשרת אישור רשתי בלבד, ורק אחרי שהשליח אישר
    foreach col in array changed loop
      if col not in ('net_approved', 'net_approved_at', 'net_approved_by', 'updated_at') then
        raise exception 'המאשרת הרשתית אינה רשאית לשנות את %', col;
      end if;
    end loop;
    if new.net_approved and not old.approved then
      raise exception 'אי אפשר לאשר אישור רשתי לפני אישור השליח';
    end if;
  end if;

  -- חתימת המאשר נקבעת בשרת, לא נשלחת מהדפדפן
  if new.approved and not old.approved then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;
  if new.net_approved and not old.net_approved then
    new.net_approved_at := now();
    new.net_approved_by := (select auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tm_enforce_columns
  before update on public.teacher_months
  for each row execute function private.enforce_column_permissions();

-- ── יומן: כל שינוי סטטוס נרשם ──────────────────────────────
create or replace function private.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, actor_role, row_id, month_key, action, detail)
    values ((select auth.uid()), private.my_role(), new.id, new.month_key, 'created',
            jsonb_build_object('name', new.name));
    return new;
  end if;

  if new.approved is distinct from old.approved then
    insert into public.audit_log (actor, actor_role, row_id, month_key, action, detail)
    values ((select auth.uid()), private.my_role(), new.id, new.month_key,
            case when new.approved then 'approved' else 'approval_revoked' end,
            jsonb_build_object('name', new.name));
  end if;
  if new.net_approved is distinct from old.net_approved then
    insert into public.audit_log (actor, actor_role, row_id, month_key, action, detail)
    values ((select auth.uid()), private.my_role(), new.id, new.month_key,
            case when new.net_approved then 'net_approved' else 'net_approval_revoked' end,
            jsonb_build_object('name', new.name));
  end if;
  if new.official_gross is distinct from old.official_gross then
    insert into public.audit_log (actor, actor_role, row_id, month_key, action, detail)
    values ((select auth.uid()), private.my_role(), new.id, new.month_key, 'simulation_entered',
            jsonb_build_object('name', new.name, 'from', old.official_gross, 'to', new.official_gross));
  end if;
  return new;
end;
$$;

create trigger tm_audit
  after insert or update on public.teacher_months
  for each row execute function private.log_status_change();

-- ═══ הרשאות ל-Data API ═════════════════════════════════════
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.schools        to authenticated;
grant select, insert, update, delete on public.months         to authenticated;
grant select, insert, update, delete on public.teacher_months to authenticated;
grant select, insert, update, delete on public.profiles       to authenticated;
grant select                        on public.audit_log       to authenticated;
