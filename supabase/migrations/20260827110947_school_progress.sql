-- מי כבר מילאה, ואצל מי תקוע.
--
-- הקישורים נשלחו, ואין דרך לדעת מי פתח אותם. הנתון קיים —
-- access_links.last_used_at — אבל הטבלה סגורה לשליח בלבד דרך RLS,
-- והמסך לא שאל אותה מעולם. בלי זה הדרך היחידה לדעת אצל מי תקוע היא
-- לרדוף אחרי כולן בוואטסאפ.
--
-- מוחזר המינימום: מתי נכנסה, וכמה שורות יש. לא הקוד עצמו — הוא מפתח
-- כניסה, ואין סיבה שיעבור ברשת יותר מפעם אחת.
create or replace function public.school_progress(p_month text)
returns table(
  school_id     uuid,
  principal     text,
  has_link      boolean,
  last_seen     timestamptz,
  teachers      integer,
  missing_contact integer,
  simulated     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    p.full_name,
    (l.code is not null),
    l.last_used_at,
    (select count(*)::int from public.teacher_months t
      where t.school_id = s.id and t.month_key = p_month),
    (select count(*)::int from public.teacher_months t
      where t.school_id = s.id and t.month_key = p_month
        and (coalesce(btrim(t.phone), '') = '' or coalesce(btrim(t.email), '') = '')),
    (select count(*)::int from public.teacher_months t
      where t.school_id = s.id and t.month_key = p_month
        and t.official_gross is not null
        and (t.reform <> 'ofek' or t.official_gross_pre is not null))
  from public.schools s
  left join public.profiles p
    on p.school_id = s.id and p.role = 'principal'
  left join public.access_links l
    on l.profile_id = p.id and not l.revoked
  where private.my_role() in ('coordinator', 'clerk')
  order by s.name;
$$;

revoke all on function public.school_progress(text) from public, anon;
grant execute on function public.school_progress(text) to authenticated;

notify pgrst, 'reload schema';
