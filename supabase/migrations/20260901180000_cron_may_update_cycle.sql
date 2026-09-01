-- לשרת מותר לעדכן את שדות המחזור, ותו לא.
--
-- שומר העמודות דורש פרופיל למשתמש המעדכן. ל-cron אין משתמש — היא רצה
-- עם מפתח השרת — ולכן כל עדכון שלה נפל על "למשתמש אין פרופיל". התגלה
-- בבדיקת המחזור: הסימון "לא דיווחה במועד" לא נכתב, ההעברה לשכר לא
-- נכתבה, וכל אחת מהן החזירה הצלחה כי איש לא בדק את השגיאה.
--
-- הפתרון אינו לפתוח את השער לרווחה: service_role כבר עוקף RLS, ואם
-- נניח לו לשנות הכול נאבד את ההגנה על עמודות הכסף. לכן רשימה סגורה —
-- בדיוק השדות שהמחזור החודשי כותב:
--
--   reported_at    מתי המנהלת דיווחה
--   late_report    הדיווח אחרי המועד
--   payroll_ready  עבר לשכר
--   leave_type/from/to  חל"ד שנקלטה מדיווח
--
-- הברוטו, התוספת, אחוז המשרה והאישור נשארים חסומים בפני השרת כמו בפני
-- כל תפקיד שאינו רשאי להם.
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
  is_server boolean := (select auth.uid()) is null
                       and coalesce(current_setting('request.jwt.claim.role', true),
                                    current_setting('role', true), '') <> 'authenticated';
begin
  if coalesce(current_setting('app.via_link', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;

  select array_agg(key) into changed
  from jsonb_each_text(to_jsonb(old)) o
  where o.value is distinct from (to_jsonb(new) ->> o.key);

  if changed is null then return new; end if;

  -- השרת (cron): רשימה סגורה של שדות המחזור
  if r is null and is_server then
    foreach col in array changed loop
      if col not in ('reported_at', 'late_report', 'payroll_ready',
                     'leave_type', 'leave_from', 'leave_to', 'updated_at') then
        raise exception 'השרת אינו רשאי לשנות %', private.col_label(col);
      end if;
    end loop;
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

  base_changed := changed && array[
    'reform', 'grade', 'degree', 'level', 'age_group', 'seniority',
    'gamul_role', 'scope_pct', 'frontal_hours', 'children_under_18'
  ];

  if r = 'principal' then
    foreach col in array changed loop
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

notify pgrst, 'reload schema';
