-- "טרם נכנסה" למי שכבר מילאה — הנפקת קישור חדש מחקה את ההיסטוריה.
--
-- הכניסה האחרונה נשאבה מהקישור הפעיל בלבד. כששרה מנפיקה קישור חדש
-- הקודם מסומן revoked, והחדש נולד עם last_used_at ריק — ולכן מזכרת
-- בתיה, שהזינה ב-28.8 שמונה עובדות עם סימולציות, הופיעה במעקב כמי
-- שטרם נכנסה, מעל כל מי שבאמת לא נגעה.
--
-- "מתי נכנסה" הוא נתון על המנהלת, לא על הטוקן: המקסימום מכל הקישורים
-- שלה, גם המבוטלים. "יש קישור" נשאר על הפעיל — זו שאלה אחרת, האם יש
-- לה במה להיכנס עכשיו. הצבירה גם מונעת שכפול שורה לבית ספר כשקיימים
-- שני קישורים פעילים.
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
    coalesce(l.has_live, false),
    l.ever_used,
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
  left join lateral (
    select bool_or(not al.revoked) as has_live,
           max(al.last_used_at)   as ever_used
    from public.access_links al
    where al.profile_id = p.id
  ) l on true
  where private.my_role() in ('coordinator', 'clerk')
  order by s.name;
$$;

revoke all on function public.school_progress(text) from public, anon;
grant execute on function public.school_progress(text) to authenticated;

notify pgrst, 'reload schema';
