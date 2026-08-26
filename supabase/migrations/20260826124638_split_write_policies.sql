-- מדיניות FOR ALL מכסה גם SELECT, ולכן כל קריאה הריצה שתי מדיניויות על
-- כל שורה. מפצלים לכתיבה בלבד, כך שלכל טבלה נשארת מדיניות קריאה אחת.

-- ── schools ────────────────────────────────────────────────
drop policy schools_write on public.schools;

create policy schools_insert on public.schools
  for insert to authenticated
  with check (private.my_role() = 'coordinator');

create policy schools_update on public.schools
  for update to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

create policy schools_delete on public.schools
  for delete to authenticated
  using (private.my_role() = 'coordinator');

-- ── months ─────────────────────────────────────────────────
drop policy months_write on public.months;

create policy months_insert on public.months
  for insert to authenticated
  with check (private.my_role() = 'coordinator');

create policy months_update on public.months
  for update to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

create policy months_delete on public.months
  for delete to authenticated
  using (private.my_role() = 'coordinator');

-- ── profiles ───────────────────────────────────────────────
-- הקריאה מאוחדת למדיניות אחת: המשתמש עצמו, או השליח שרואה את כולם.
drop policy profiles_manage_by_coordinator on public.profiles;

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (private.my_role() = 'coordinator');

create policy profiles_update on public.profiles
  for update to authenticated
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (private.my_role() = 'coordinator');
