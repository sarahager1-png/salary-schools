-- האישור הרשתי אינו של אדם אחד לכל הרשת.
-- עפולה מאושרת בידי מענדי כהן, רעננה בידי חנה אברומוביץ, וכל השאר בידי רינה.
--
-- מאשר עם school_id מאשר את בית הספר שלו בלבד.
-- מאשר בלי school_id (רינה) מאשר את כל בתי הספר שאין להם מאשר ייעודי.

create or replace function private.has_dedicated_approver(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.role = 'network' and p.school_id = p_school
  );
$$;

revoke all on function private.has_dedicated_approver(uuid) from public, anon, authenticated;
grant execute on function private.has_dedicated_approver(uuid) to authenticated;

-- בית ספר שאני אחראית על האישור הרשתי שלו
create or replace function private.approves_school(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.my_role() <> 'network' then false
    when private.my_school() is not null then p_school = private.my_school()
    else not private.has_dedicated_approver(p_school)
  end;
$$;

revoke all on function private.approves_school(uuid) from public, anon, authenticated;
grant execute on function private.approves_school(uuid) to authenticated;

-- ── מדיניות מעודכנת ────────────────────────────────────────
drop policy tm_select on public.teacher_months;
drop policy tm_update on public.teacher_months;

create policy tm_select on public.teacher_months
  for select to authenticated
  using (
    private.my_role() in ('coordinator', 'clerk')
    or (private.my_role() = 'principal' and school_id = private.my_school())
    or private.approves_school(school_id)
  );

create policy tm_update on public.teacher_months
  for update to authenticated
  using (
    private.my_role() in ('coordinator', 'clerk')
    or (private.my_role() = 'principal' and school_id = private.my_school())
    or private.approves_school(school_id)
  )
  with check (
    private.my_role() in ('coordinator', 'clerk')
    or (private.my_role() = 'principal' and school_id = private.my_school())
    or private.approves_school(school_id)
  );

-- מאשר רשתי משויך לבית ספר עדיין צריך לראות את רשימת בתי הספר,
-- וזה כבר מותר: schools_read פתוחה לכל מחובר.
