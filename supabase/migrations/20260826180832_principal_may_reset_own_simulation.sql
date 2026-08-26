-- מנהלת שמגלה ותק שגוי אחרי שהוזן שכר הייתה תקועה לגמרי.
--
-- שינוי בשדה בסיס מבטל את הסימולציה ואת האישורים — הלקוח מאפס אותם
-- באותה שמירה, והטריגר חסם אותה בדיוק על העמודות האלה. התוצאה: 400
-- עם שם עמודה באנגלית, ואין שום דרך לתקן.
--
-- האיסור עצמו נכון: מנהלת לא מזינה שכר ולא מאשרת. מה שהיה חסר הוא
-- ההבחנה בין *הזנה* לבין *ביטול שנגרר* משינוי מותר. לכן מותר לה
-- לאפס — ורק לאפס — וגם זה רק כששדה בסיס באמת השתנה באותה שמירה.

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
        raise exception 'מנהלת בית ספר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in ('official_gross', 'official_gross_pre', 'actual_employer_cost', 'updated_at') then
        raise exception 'חשבת שכר אינה רשאית לשנות את %', col;
      end if;
    end loop;

  elsif r = 'network' then
    foreach col in array changed loop
      if col not in ('net_approved', 'net_approved_at', 'net_approved_by', 'updated_at') then
        raise exception 'המאשרת הרשתית אינה רשאית לשנות את %', col;
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
