-- הודעות השגיאה של ההרשאות — בעברית.
--
-- קודם הן הציגו את שם העמודה כפי שהוא במסד: "חשבת שכר אינה רשאית לשנות את
-- children_under_18". מי שקיבלה את זה על המסך לא ידעה במה מדובר ולא מה
-- לעשות. עכשיו מוצג שם השדה בעברית, ולצידו מי כן רשאית למלא אותו.

create or replace function private.col_label(p_col text)
returns text
language sql
immutable
as $$
  select coalesce(
    case p_col
      when 'children_under_18'    then 'את מספר הילדים עד גיל 18 (שדה של המנהלת — הוא משנה את השכר בעולם הישן)'
      when 'frontal_hours'        then 'את שעות ההוראה (שדה של המנהלת)'
      when 'scope_pct'            then 'את אחוז המשרה (שדה של המנהלת)'
      when 'seniority'            then 'את הוותק (שדה של המנהלת)'
      when 'reform'               then 'את מסלול הרפורמה (שדה של המנהלת)'
      when 'grade'                then 'את הדרגה (שדה של המנהלת)'
      when 'degree'               then 'את התואר (שדה של המנהלת)'
      when 'level'                then 'את שלב החינוך (שדה של המנהלת)'
      when 'age_group'            then 'את קבוצת הגיל (שדה של המנהלת)'
      when 'gamul_role'           then 'את התפקיד (שדה של המנהלת)'
      when 'leave_type'           then 'את סטטוס החופשה (שדה של המנהלת)'
      when 'travel_days'          then 'את ימי הנסיעה (שדה של המנהלת)'
      when 'daycare_children'     then 'את מספר הילדים עד גיל 5 (שדה של המנהלת)'
      when 'absence_days'         then 'את ימי ההיעדרות (שדה של המנהלת)'
      when 'official_gross'       then 'את הברוטו הרשמי (שדה של חשבת השכר)'
      when 'official_gross_pre'   then 'את הברוטו בעולם הישן (שדה של חשבת השכר)'
      when 'actual_employer_cost' then 'את עלות המעביד בפועל (שדה של חשבת השכר)'
      when 'agreed_gross'         then 'את הברוטו המוסכם (שדה של השליח)'
      when 'approved'             then 'את אישור השליח'
      when 'net_approved'         then 'את האישור הרשתי'
      when 'school_id'            then 'את שיוך בית הספר'
      else null
    end,
    'את השדה ' || p_col);
$$;

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
        raise exception 'מנהלת בית ספר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'actual_employer_cost', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'network' then
    foreach col in array changed loop
      if col not in ('net_approved', 'net_approved_at', 'net_approved_by', 'updated_at') then
        raise exception 'המאשרת הרשתית אינה רשאית לשנות %', private.col_label(col);
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
