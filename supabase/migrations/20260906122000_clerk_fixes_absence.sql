-- חשבת השכר מתקנת דיווחי היעדרות וממ"מ שגויים של מנהלות (שרה בעקבות ממצא QA, 6.9).
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

  if r is null and is_server then
    foreach col in array changed loop
      -- המרַיץ האוטומטי ממלא ברוטו — אבל רק לשורה שאין בה: מילוי ריק
      -- מותר, דריסה של מספר שהוזן ביד לעולם לא (הוראת שרה, 1.9).
      if col = 'official_gross' and old.official_gross is null then
        continue;
      end if;
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
                 'payroll_ready', 'slip_issued_at', 'slip_gross') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in (
        -- המספרים שהיא מזינה
        'official_gross', 'official_gross_pre', 'chabad_supp', 'actual_employer_cost',
        'gross_set_at', 'gross_set_by',
        -- הנתונים המקצועיים שהיא מתקנת
        'seniority', 'degree', 'grade', 'level', 'age_group', 'gamul_role', 'reform',
        -- הווי שלה והברוטו שיצא בתלוש — עמודות משלה, לא דריסה
        'slip_issued_at', 'slip_gross',
        -- דיווחי היעדרות וממ"מ — היא מתקנת דיווח שגוי של מנהלת (6.9)
        'absence_days', 'absence_reason', 'sick_form_path', 'mm_hours', 'mm_for', 'mm_from', 'mm_to',
        -- אישור — נותנת ומבטלת (שרה, 3.9); תיקון מחזיר לאישור כרגיל
        'approved', 'approved_at', 'approved_by', 'changed_at', 'snapshot', 'updated_at'
      ) then
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
