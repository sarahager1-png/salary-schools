-- חשבת השכר מזינה ברוטו, תוספת בית חב"ד ועלות מעביד.
--
-- עד היום היא הזינה את הברוטו כתוצאה של סימולציה, ותוספת בית חב"ד הייתה
-- פער מחושב בין שתי סימולציות. הסימולטור יורד (הכרעת שרה, 1.9), והתוספת
-- הופכת למספר שהיא מזינה — ולכן היא חייבת רשות לכתוב אותו.
--
-- מתווספות גם gross_set_at ו-gross_set_by: מי הזינה את הברוטו ומתי. בלי
-- זה אי אפשר לדעת אם המספר שעל המסך הוא של החשבת או שריד מהסימולציה.
--
-- שאר השדות נשארים חסומים בפניה, ובראשם אחוז המשרה: הוא של שרה.
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

  -- שדות שמשנים את תוצאת החישוב, ולכן מבטלים אותו
  base_changed := changed && array[
    'reform', 'grade', 'degree', 'level', 'age_group', 'seniority',
    'gamul_role', 'scope_pct', 'frontal_hours', 'children_under_18'
  ];

  if r = 'principal' then
    foreach col in array changed loop
      -- ביטול שנגרר משינוי מותר: מותר, ורק לכיוון האיפוס
      if base_changed and (
           (col in ('official_gross', 'official_gross_pre', 'chabad_supp',
                    'approved_at', 'approved_by', 'net_approved_at', 'net_approved_by')
            and (to_jsonb(new) ->> col) is null)
        or (col = 'approved'     and not new.approved)
        or (col = 'net_approved' and not new.net_approved)
      ) then
        continue;
      end if;

      if col in ('official_gross', 'official_gross_pre', 'chabad_supp', 'agreed_gross',
                 'actual_employer_cost', 'approved', 'approved_at', 'approved_by',
                 'net_approved', 'net_approved_at', 'net_approved_by', 'school_id',
                 'payroll_ready') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'chabad_supp',
                     'actual_employer_cost', 'gross_set_at', 'gross_set_by', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'network' then
    -- התפקיד אינו מאשר עוד (הכרעת שרה, 1.9). נשאר חסום לכל שינוי.
    raise exception 'התפקיד הזה אינו מעדכן שורות שכר';
  end if;

  if new.approved and not old.approved then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- תוויות בעברית לשדות החדשים, כדי שהודעת השגיאה תהיה קריאה
create or replace function private.col_label(p_col text)
returns text
language sql
immutable
as $$
  select coalesce(
    case p_col
      when 'children_under_18'    then 'את מספר הילדים עד גיל 18 (שדה של המנהלת — הוא משנה את השכר בעולם הישן)'
      when 'frontal_hours'        then 'את שעות ההוראה (שדה של המנהלת)'
      when 'scope_pct'            then 'את אחוז המשרה (שדה של השליח)'
      when 'official_gross'       then 'את הברוטו (שדה של חשבת השכר)'
      when 'chabad_supp'          then 'את תוספת בית חב"ד (שדה של חשבת השכר)'
      when 'actual_employer_cost' then 'את עלות המעביד בפועל (שדה של חשבת השכר)'
      when 'agreed_gross'         then 'את הברוטו המוסכם (שדה של השליח)'
      when 'approved'             then 'את האישור'
      when 'payroll_ready'        then 'את המעבר לשכר'
      when 'school_id'            then 'את שיוך בית הספר'
      else null
    end,
    'את השדה ' || p_col);
$$;

notify pgrst, 'reload schema';
