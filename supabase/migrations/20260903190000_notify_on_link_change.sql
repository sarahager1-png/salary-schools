-- "תכניס אוטומציות עם המספר שלי — כשבית ספר מעדכן משהו מייד תקפוץ לי
-- הודעה" (שרה, 3.9.2026).
--
-- כל שמירה שמגיעה מהקישור של מנהלת (app.via_link='1') נכנסת לתור
-- ההודעות הקיים (notifications), והקרון שולח לוואטסאפ של שרה. הטלפון
-- נלקח מהפרופיל שלה — בלי טלפון בפרופיל הטריגר שקט ולא שולח דבר.
--
-- קיבוץ: מנהלת שממלאת עשרה כרטיסים ברצף מייצרת הודעה אחת — כל שינוי
-- נוסף מצטרף להודעה הממתינה של אותו בית ספר ודוחה את השליחה בשתי
-- דקות, כך שההודעה יוצאת פעם אחת, שלמה.
create or replace function private.notify_link_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  sc_name text;
  changed text;
  line text;
  existing record;
begin
  -- רק עדכונים שמגיעות מהקישור של מנהלת — לא עריכות של שרה/אסתר במערכת
  if coalesce(current_setting('app.via_link', true), '') <> '1' then
    return new;
  end if;

  select p.phone into v_phone
  from public.profiles p
  where p.role = 'coordinator' and p.full_name = 'שרה הגר'
    and coalesce(p.phone, '') <> ''
  limit 1;
  if v_phone is null then return new; end if;

  select s.name into sc_name from public.schools s where s.id = new.school_id;

  if tg_op = 'INSERT' then
    changed := 'נוספה לרשימה';
  else
    select string_agg(lbl, ', ') into changed from (
      select case o.key
          when 'frontal_hours'     then 'שעות'
          when 'seniority'         then 'ותק'
          when 'degree'            then 'תואר'
          when 'grade'             then 'דרגה'
          when 'reform'            then 'מסלול'
          when 'gamul_role'        then 'תפקיד'
          when 'level'             then 'שלב'
          when 'age_group'         then 'קבוצת גיל'
          when 'absence_days'      then 'ימי היעדרות'
          when 'mm_hours'          then 'שעות ממ"מ'
          when 'mm_for'            then 'במקום מי'
          when 'leave_type'        then 'סטטוס חופשה'
          when 'leave_from'        then 'תחילת חופשה'
          when 'leave_to'          then 'סיום חופשה'
          when 'children_under_18' then 'ילדים עד 18'
          when 'monthly_extras'    then 'תוספות'
          when 'travel_days'       then 'ימי נסיעה'
          when 'daycare_children'  then 'ילדי מעון'
          when 'phone'             then 'טלפון'
          when 'email'             then 'מייל'
          when 'name'              then 'שם'
          when 'tz_id'             then 'ת.ז.'
          else null
        end as lbl
      from jsonb_each_text(to_jsonb(old)) o
      where o.value is distinct from (to_jsonb(new) ->> o.key)
    ) x where lbl is not null;
    -- שינוי טכני בלבד (חותמות, אישורים) — אין על מה להודיע
    if changed is null or changed = '' then return new; end if;
    changed := 'עודכנו: ' || changed;
  end if;

  line := '• ' || new.name || ' — ' || changed;

  select n.id, n.body into existing
  from public.notifications n
  where n.status = 'pending' and n.channel = 'whatsapp'
    and n.kind = 'link_change' and n.to_phone = v_phone
    and n.month_key = new.month_key
    and n.body like '%' || coalesce(sc_name, '') || '%'
  order by n.created_at desc
  limit 1;

  if existing.id is not null then
    update public.notifications
      set body = existing.body || E'\n' || line,
          send_after = now() + interval '2 minutes'
      where id = existing.id;
  else
    insert into public.notifications
      (kind, to_phone, to_name, body, teacher_id, month_key, status, channel, send_after)
    values
      ('link_change', v_phone, 'שרה הגר',
       '🏫 עדכון מ' || coalesce(sc_name, 'בית ספר') || ' · ' || new.month_key || E'\n' || line,
       new.id, new.month_key, 'pending', 'whatsapp', now() + interval '2 minutes');
  end if;

  return new;
exception when others then
  -- הודעה שנכשלה לעולם אינה מפילה שמירה של מנהלת
  return new;
end;
$$;

drop trigger if exists trg_notify_link_change on public.teacher_months;
create trigger trg_notify_link_change
  after insert or update on public.teacher_months
  for each row execute function private.notify_link_change();
