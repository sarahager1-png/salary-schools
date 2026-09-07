-- הודעות הרשאה בעברית.
--
-- כשחשבת השכר ניסתה למלא "ילדים עד 18" היא קיבלה:
--   "חשבת שכר אינה רשאית לשנות את children_under_18"
-- שם העמודה במסד אינו אומר דבר למי שעומדת מול המסך. כאן נוסף מילון
-- שמתרגם אותו, וההודעה הופכת ל"...אינה רשאית לשנות את מספר ילדים עד 18".
--
-- ההרשאה עצמה לא משתנה: ילדים עד 18 הוא שדה בסיס שמשנה את השכר בעולם
-- הישן ומבטל את הסימולציה ואת האישור, ולכן הוא באחריות המנהלת בלבד.

create or replace function private.col_label(col text)
returns text
language sql
immutable
as $lbl$
  select case col
    when 'children_under_18'  then 'מספר ילדים עד 18'
    when 'official_gross'     then 'ברוטו רשמי'
    when 'official_gross_pre' then 'ברוטו עולם ישן'
    when 'agreed_gross'       then 'ברוטו מוסכם'
    when 'actual_employer_cost' then 'עלות מעביד בפועל'
    when 'approved'           then 'אישור השליח'
    when 'approved_at'        then 'מועד אישור השליח'
    when 'approved_by'        then 'מאשר/ת השליח'
    when 'net_approved'       then 'אישור רשתי'
    when 'net_approved_at'    then 'מועד האישור הרשתי'
    when 'net_approved_by'    then 'המאשרת הרשתית'
    when 'school_id'          then 'שיוך לבית ספר'
    when 'reform'             then 'מסלול'
    when 'grade'              then 'דרגה'
    when 'degree'             then 'תואר'
    when 'level'              then 'שלב'
    when 'age_group'          then 'קבוצת גיל'
    when 'seniority'          then 'ותק'
    when 'gamul_role'         then 'תפקיד'
    when 'scope_pct'          then 'אחוז משרה'
    when 'frontal_hours'      then 'שעות פרונטליות'
    when 'absence_days'       then 'ימי היעדרות'
    when 'mm_hours'           then 'שעות מילוי מקום'
    when 'mm_for'             then 'במקום מי'
    when 'monthly_extras'     then 'תוספות החודש'
    when 'travel_days'        then 'ימי נסיעה'
    when 'daycare_children'   then 'ילדים עד גיל 5 (מעונות)'
    when 'leave_type'         then 'סטטוס חופשה'
    when 'leave_from'         then 'תאריך יציאה לחופשה'
    when 'leave_to'           then 'תאריך חזרה מחופשה'
    when 'min_wage_supp'      then 'תוספת שכר מינימום'
    when 'nihul_grade'        then 'דרגת ניהול'
    else col
  end;
$lbl$;

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
  base_changed boolean;
begin
  -- עדכון שהגיע מ-link_save_row: כבר עבר אימות מלא שם
  if coalesce(current_setting('app.via_link', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;

  if r is null then
    raise exception 'למשתמש אין פרופיל במערכת';
  end if;

  if exists (select 1 from public.months m where m.key = new.month_key and m.locked)
     and r <> 'coordinator' then
    raise exception 'החודש % נעול', new.month_key;
  end if;

  select array_agg(key) into changed
  from jsonb_each_text(to_jsonb(old)) o
  where o.value is distinct from (to_jsonb(new) ->> o.key);

  if changed is null then return new; end if;

  -- שדות שמשנים את תוצאת הסימולציה, ולכן מבטלים אותה
  base_changed := changed && array[
    'reform', 'grade', 'degree', 'level', 'age_group', 'seniority',
    'gamul_role', 'scope_pct', 'frontal_hours', 'children_under_18'
  ];

  if r = 'principal' then
    foreach col in array changed loop
      -- ביטול שנגרר משינוי מותר: מותר, ורק לכיוון האיפוס
      if base_changed and (
           (col in ('official_gross', 'official_gross_pre',
                    'approved_at', 'approved_by', 'net_approved_at', 'net_approved_by')
            and (to_jsonb(new) ->> col) is null)
        or (col = 'approved'     and not new.approved)
        or (col = 'net_approved' and not new.net_approved)
      ) then
        continue;
      end if;

      if col in ('official_gross', 'official_gross_pre', 'agreed_gross',
                 'actual_employer_cost', 'approved', 'approved_at', 'approved_by',
                 'net_approved', 'net_approved_at', 'net_approved_by', 'school_id') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות את %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'actual_employer_cost', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות את %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'network' then
    foreach col in array changed loop
      if col not in ('net_approved', 'net_approved_at', 'net_approved_by', 'updated_at') then
        raise exception 'המאשרת הרשתית אינה רשאית לשנות את %', private.col_label(col);
      end if;
    end loop;
    if new.net_approved and not old.approved then
      raise exception 'אי אפשר לאשר אישור רשתי לפני אישור השליח';
    end if;
  end if;

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

notify pgrst, 'reload schema';
