/*
  היעדרות מחייבת אישור, ומילוי מקום תואם לשעות ההיעדרות (שרה, 4.10.26).

  "העדרות חייבת להיות עם אישור ומילוי המקום חייב להיות תואם לשעות
  ההעדרות. כל עוד אין אישור העדרות ממלאת המקום לא תוכל לקבל שכר והתנועה
  לא נשלחת ... עובדת הוראה שלא שלחה אישור מקבלת הודעה עליך לשלוח אישור
  למנהלת."

  הכרעות באותה שיחה:
  · חלון הדיווח נשאר 1–20 (הכרעת 21.9) — כאן לא משתנה דבר בנעילה.
  · בלי אישור מוחזק מילוי המקום בלבד; השכר הרגיל של הממלאת ושל הנעדרת
    עובר כרגיל. לכן אין כאן חסימה של אישור או של סימולציה — ההחזקה
    נגזרת במסך (מילוי מקום שהנעדרת שלו בלי אישור אינו מוצג לחשבת כתנועה).
  · מילוי מקום אינו משולם דרך המערכת (נשאר "אין מ"מ שוטף", 22.9).
  · אישור נדרש לכל סיבות ההיעדרות, כולל חופשת לידה וחל"ת.

  מה יש כאן:
  1. teacher_months.absence_hours — שעות ההיעדרות, הבסיס להתאמה.
  2. link_save_row שומרת שוב את סיבת ההיעדרות, את האישור המצורף ואת
     תקופת מילוי המקום. הם נשמטו מהפונקציה בשכתוב של 10.9 ומאז לא נשמרו
     מהקישור כלל (נבדק מול המסד החי ב-4.10: אפס שורות עם סיבה או אישור).
     "במקום מי" מתנקה כשמוחקים דיווח (coalesce השאיר את הערך הישן).
  3. private.enforce_absence_rules — מילוי מקום של מנהלת נרשם רק מול
     היעדרות, וסך שעותיו אינו עולה על שעות ההיעדרות. נתיב אישור שלא
     הועלה באמת לדלי נדחה.
  4. private.notify_absence_doc — הודעת וואטסאפ לעובדת כשדווחה היעדרות
     בלי אישור. פעם אחת לשורה, לא בשבת ולא בלילה, ומתבטלת אם האישור
     צורף לפני שיצאה.
  5. enforce_column_permissions — חשבת השכר רשאית לתקן גם את שעות
     ההיעדרות, כמו שאר שדות ההיעדרות (clerk_fixes_absence, 6.9). זה השינוי
     היחיד בפונקציה; שאר הגוף הוא ההגדרה החיה כלשונה.
  6. public.link_attach_doc — צירוף אישור אחרי ה-20, לחופשת לידה בלבד.
*/


alter table public.teacher_months
  add column if not exists absence_hours integer not null default 0;

alter table public.teacher_months
  drop constraint if exists teacher_months_absence_hours_check;
alter table public.teacher_months
  add constraint teacher_months_absence_hours_check check (absence_hours >= 0);

comment on column public.teacher_months.absence_hours is
  'שעות ההיעדרות בחודש, כפי שדיווחה המנהלת. סך שעות מילוי המקום במקום העובדת אינו עולה עליהן.';
comment on column public.teacher_months.sick_form_path is
  'נתיב אישור ההיעדרות בדלי sick-forms (מחלה, מילואים, חופשת לידה ועוד) — הועלה מהקישור של המנהלת';

-- מי שמבצעת את השינוי היא מנהלת: מהקישור, או בכניסה רגילה
create or replace function private.is_principal_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(current_setting('app.via_link', true), '') = '1'
      or coalesce(private.my_role()::text, '') = 'principal';
$$;
revoke all on function private.is_principal_write() from public;

/*
  כללי ההיעדרות ומילוי המקום.

  חלים על דיווח של מנהלת בלבד. שרה וחשבת השכר מתקנות בלי הכלל הזה,
  וקרון פתיחת החודש מעתיק שורות בלי שייבדקו — אחרת שורה ישנה שדווחה
  לפני הכלל הייתה נתקעת בכל תיקון שאינו קשור.
*/
create or replace function private.enforce_absence_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  by_principal boolean := private.is_principal_write();
  v_for      text;
  v_prefix   text;
  found_n    integer;
  abs_hours  integer;
  on_leave   boolean;
  other_mm   integer;
  mm_changed boolean;
begin
  -- אישור שלא הועלה באמת אינו אישור: הנתיב חייב להיות של השורה הזו
  -- ולהימצא בדלי. בלי זה די היה לשלוח מחרוזת כלשהי כדי לשחרר מילוי מקום.
  if tg_op = 'INSERT' then
    if by_principal then new.sick_form_path := null; end if;
  elsif new.sick_form_path is not null
        and new.sick_form_path is distinct from old.sick_form_path then
    v_prefix := new.month_key || '/' || new.id::text || '/';
    if left(new.sick_form_path, length(v_prefix)) <> v_prefix
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'sick-forms' and o.name = new.sick_form_path) then
      raise exception 'אישור ההיעדרות לא נמצא במערכת. יש לצרף את הקובץ מחדש.';
    end if;
  end if;

  if not by_principal then
    return new;
  end if;

  -- שתי שמירות בו-זמנית מול אותה היעדרות היו קוראות כל אחת סכום ישן
  -- ועוברות שתיהן. הנעילה היא לבית ספר ולחודש, ומשתחררת בסוף הטרנזקציה.
  perform pg_advisory_xact_lock(
    hashtextextended('absence_rules|' || new.school_id::text || '|' || new.month_key, 0));

  -- "במקום מי" נשען על השם. שינוי שם של מי שכבר דווח מולה מילוי מקום
  -- היה מנתק את הקשר בשקט.
  if tg_op = 'UPDATE' and btrim(new.name) is distinct from btrim(old.name)
     and exists (select 1 from public.teacher_months t
                  where t.month_key = old.month_key and t.school_id = old.school_id
                    and btrim(coalesce(t.mm_for, '')) = btrim(old.name) and t.id <> old.id) then
    raise exception 'דווח מילוי מקום במקום %. יש לעדכן קודם את מילוי המקום, ורק אחר כך לשנות את השם.', old.name;
  end if;

  mm_changed := tg_op = 'INSERT'
    or new.mm_hours is distinct from old.mm_hours
    or coalesce(btrim(new.mm_for), '') is distinct from coalesce(btrim(old.mm_for), '');

  -- מילוי מקום נרשם רק מול היעדרות, ועד שעות ההיעדרות
  if mm_changed and coalesce(new.mm_hours, 0) > 0 then
    v_for := nullif(btrim(coalesce(new.mm_for, '')), '');
    if v_for is null then
      raise exception 'יש לבחור במקום מי מולא המקום';
    end if;

    select count(*), coalesce(sum(t.absence_hours), 0), coalesce(bool_or(t.leave_type <> 'none'), false)
      into found_n, abs_hours, on_leave
    from public.teacher_months t
    where t.month_key = new.month_key and t.school_id = new.school_id
      and btrim(t.name) = v_for and t.id <> new.id;

    if found_n = 0 then
      raise exception 'לא נמצא בבית הספר עובד הוראה בשם "%". יש לבחור את השם מהרשימה.', v_for;
    end if;

    -- חופשת לידה וחל"ת נמדדות בתאריכים ולא בשעות: המחליפה מדווחת שעות
    -- שבועיות (שרה, 6.9), ואין מול מה להשוות.
    if not on_leave then
      if abs_hours <= 0 then
        raise exception 'קודם יש לדווח את ההיעדרות של %, כולל שעות ההיעדרות. מילוי מקום נרשם רק מול היעדרות.', v_for;
      end if;

      select coalesce(sum(t.mm_hours), 0) into other_mm
      from public.teacher_months t
      where t.month_key = new.month_key and t.school_id = new.school_id
        and btrim(coalesce(t.mm_for, '')) = v_for and t.id <> new.id;

      if other_mm + new.mm_hours > abs_hours then
        raise exception 'שעות מילוי המקום (%) גבוהות משעות ההיעדרות של % (%). מילוי מקום אינו יכול לעלות על שעות ההיעדרות.',
          other_mm + new.mm_hours, v_for, abs_hours;
      end if;
    end if;
  end if;

  -- ובכיוון ההפוך: אי אפשר להוריד שעות היעדרות מתחת למילוי מקום שכבר דווח,
  -- ואי אפשר לבטל חופשה שמולה רשום מילוי מקום
  if tg_op = 'UPDATE' and new.leave_type = 'none'
     and (new.absence_hours < old.absence_hours or old.leave_type <> 'none') then
    select coalesce(sum(t.mm_hours), 0) into other_mm
    from public.teacher_months t
    where t.month_key = new.month_key and t.school_id = new.school_id
      and btrim(coalesce(t.mm_for, '')) = btrim(new.name) and t.id <> new.id;

    select coalesce(sum(t.absence_hours), 0) into abs_hours
    from public.teacher_months t
    where t.month_key = new.month_key and t.school_id = new.school_id
      and btrim(t.name) = btrim(new.name) and t.id <> new.id;

    if other_mm > abs_hours + new.absence_hours then
      raise exception 'כבר דווחו % שעות מילוי מקום במקום %. יש לעדכן קודם את מילוי המקום.', other_mm, new.name;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_absence_rules() from public;

drop trigger if exists trg_absence_rules on public.teacher_months;
create trigger trg_absence_rules
  before insert or update on public.teacher_months
  for each row execute function private.enforce_absence_rules();

/*
  מתי הודעה לעובדת יוצאת: לא בלילה ולא בשבת.

  08:00–21:00 לפי שעון ישראל; מיום שישי 14:00 ועד מוצאי שבת — ביום
  ראשון ב-08:00. חגים אינם מטופלים כאן.
*/
create or replace function private.next_send_time(p_from timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  l   timestamp := p_from at time zone 'Asia/Jerusalem';
  dow integer;
begin
  if l::time >= time '21:00' then
    l := date_trunc('day', l) + interval '1 day 8 hours';
  elsif l::time < time '08:00' then
    l := date_trunc('day', l) + interval '8 hours';
  end if;
  dow := extract(dow from l)::integer;   -- 0 = ראשון … 6 = שבת
  if dow = 6 then
    l := date_trunc('day', l) + interval '1 day 8 hours';
  elsif dow = 5 and l::time >= time '14:00' then
    l := date_trunc('day', l) + interval '2 days 8 hours';
  end if;
  return l at time zone 'Asia/Jerusalem';
end;
$$;
revoke all on function private.next_send_time(timestamptz) from public;

/*
  "עובדת הוראה שלא שלחה אשור מקבלת הודעה עליך לשלוח אשור למנהלת".

  ההודעה נכנסת לתור הקיים (notifications) ויוצאת בקרון queue-drain.
  · רק כשמנהלת מדווחת היעדרות חדשה בלי אישור — לא על שורות ישנות, לא
    בהעתקת החודש ולא בתיקון של שרה או של חשבת השכר.
  · פעם אחת לשורה. רבע שעה של המתנה: מנהלת שמצרפת את האישור מיד אחרי
    הדיווח מבטלת את ההודעה לפני שיצאה.
  · בלי טלפון על השורה אין הודעה.
*/
create or replace function private.notify_absence_doc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_abs  boolean;
  had_abs  boolean := false;
  v_phone  text;
  v_school text;
  v_male   boolean;
  v_doc    text;
  v_reason text;
  v_month  text;
begin
  has_abs := new.absence_reason is not null or new.absence_days > 0
          or new.absence_hours > 0 or new.leave_type <> 'none';

  -- האישור צורף, או שההיעדרות נמחקה — הודעה שעוד לא יצאה מתבטלת
  if new.sick_form_path is not null or not has_abs then
    update public.notifications
       set status = 'cancelled'
     where kind = 'absence_doc_needed' and teacher_id = new.id and status = 'pending';
    return new;
  end if;

  v_phone := nullif(btrim(coalesce(new.phone, '')), '');

  -- הטלפון תוקן לפני שההודעה יצאה — היא יוצאת למספר המעודכן, או מתבטלת
  if tg_op = 'UPDATE' and new.phone is distinct from old.phone then
    update public.notifications
       set to_phone = coalesce(v_phone, to_phone),
           to_name  = new.name,
           status   = case when v_phone is null then 'cancelled' else status end
     where kind = 'absence_doc_needed' and teacher_id = new.id and status = 'pending';
  end if;

  if not private.is_principal_write() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    had_abs := old.absence_reason is not null or old.absence_days > 0
            or old.absence_hours > 0 or old.leave_type <> 'none';
  end if;
  if had_abs then
    return new;
  end if;

  v_phone := nullif(btrim(coalesce(new.phone, '')), '');
  if v_phone is null then
    return new;
  end if;
  if exists (select 1 from public.notifications n
              where n.kind = 'absence_doc_needed' and n.teacher_id = new.id
                and n.status in ('pending', 'sent')) then
    return new;
  end if;

  select s.name into v_school from public.schools s where s.id = new.school_id;
  select coalesce(p.gender, '') = 'm' into v_male
    from public.profiles p
   where p.role = 'principal' and p.school_id = new.school_id
   limit 1;

  v_reason := case coalesce(new.absence_reason, case new.leave_type when 'maternity' then 'maternity' when 'unpaid' then 'unpaid' else '' end)
    when 'sick'       then 'מחלה'
    when 'child_sick' then 'מחלת ילד'
    when 'miluim'     then 'מילואים'
    when 'maternity'  then 'חופשת לידה'
    when 'unpaid'     then 'חופשה ללא תשלום'
    else null end;
  v_doc := case coalesce(new.absence_reason, '')
    when 'sick'       then 'אישור מחלה'
    when 'child_sick' then 'אישור מחלה'
    when 'miluim'     then 'אישור מילואים'
    else 'אישור' end;
  v_month := split_part(new.month_key, '-', 2) || '/' || split_part(new.month_key, '-', 1);

  insert into public.notifications (kind, to_phone, to_name, teacher_id, month_key, send_after, body)
  values (
    'absence_doc_needed', v_phone, new.name, new.id, new.month_key,
    private.next_send_time(now() + interval '15 minutes'),
    new.name || ', שלום.' || E'\n'
      || 'ב' || coalesce(v_school, 'בית הספר') || ' דווחה עבורך היעדרות בחודש ' || v_month
      || coalesce(' (' || v_reason || ')', '') || '.' || E'\n'
      || 'עליך לשלוח ' || v_doc || ' '
      || case when coalesce(v_male, false) then 'למנהל' else 'למנהלת' end || ' בית הספר.'
  );
  return new;
end;
$$;
revoke all on function private.notify_absence_doc() from public;

drop trigger if exists trg_notify_absence_doc on public.teacher_months;
create trigger trg_notify_absence_doc
  after insert or update on public.teacher_months
  for each row execute function private.notify_absence_doc();

/*
  צירוף אישור אחרי ה-20 — ליולדת בלבד (שרה, 4.10.26: "צרוף אשור רק ליולדת").

  מה-21 המנהלת אינה משנה דיווחים, ולכן אישור שהגיע באיחור לא היה ניתן
  לצירוף ומילוי המקום נשאר מוחזק. כאן נפתח פתח אחד וצר: אישור לחופשת
  לידה. הפונקציה משנה רק את נתיב האישור, רק בשורה של עובדת בחופשת לידה,
  ורק כשהחודש לא ננעל ביד ולא עבר מועד הנעילה הסופי שלו. הנתיב עצמו
  נבדק בטריגר (private.enforce_absence_rules) כמו בכל שמירה.
  אישור הדיווח (report_pending) אינו משתנה: זה מסמך, לא נתון שכר.
*/
create or replace function public.link_attach_doc(p_code text, p_row uuid, p_path text)
returns public.teacher_months
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr     public.profiles;
  target public.teacher_months;
  result public.teacher_months;
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_closed boolean;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr.id is null or pr.role <> 'principal' then
    raise exception 'הקישור אינו תקף';
  end if;

  -- השורה ננעלת עד סוף הפעולה: בלי זה שינוי בו-זמני של הסטטוס היה עובר בין הבדיקה לעדכון
  select * into target from public.teacher_months where id = p_row for update;
  if target.id is null or target.school_id is distinct from pr.school_id then
    raise exception 'השורה אינה שייכת לבית הספר שלך';
  end if;
  if v_path is null then
    raise exception 'לא צורף קובץ';
  end if;
  if (target.leave_type = 'maternity' or coalesce(target.absence_reason, '') = 'maternity') is not true then
    raise exception 'אחרי ה-20 בחודש אפשר לצרף אישור רק לחופשת לידה. אישור אחר יצורף בחלון הדיווח הבא, מה-1 עד ה-20.';
  end if;
  -- שורת החודש ננעלת לקריאה, כדי שנעילה ביד לא תיכנס באמצע
  select m.locked or (m.lock_due is not null
                      and (now() at time zone 'Asia/Jerusalem')::date >= m.lock_due)
    into v_closed
    from public.months m
   where m.key = target.month_key
     for share;
  if v_closed is not false then
    raise exception 'החודש % נעול לשינויים.', target.month_key;
  end if;

  perform set_config('app.via_link', '1', true);
  update public.teacher_months
     set sick_form_path = v_path,
         updated_at     = now()
   where id = target.id
  returning * into result;
  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$$;
revoke all on function public.link_attach_doc(text, uuid, text) from public;
grant execute on function public.link_attach_doc(text, uuid, text) to anon, authenticated;

-- ── שמירה דרך הקישור: ההגדרה מ-21.9 בתוספת שדות ההיעדרות ומילוי המקום ──
CREATE OR REPLACE FUNCTION public.link_save_row(p_code text, p_row jsonb)
 RETURNS teacher_months
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pr public.profiles;
  target public.teacher_months;
  result public.teacher_months;
  base_changed boolean;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr.id is null or pr.role <> 'principal' then
    raise exception 'הקישור אינו תקף';
  end if;

  select * into target from public.teacher_months where id = (p_row ->> 'id')::uuid;
  if target.id is null or target.school_id is distinct from pr.school_id then
    raise exception 'השורה אינה שייכת לבית הספר שלך';
  end if;
  if private.link_locked(target.month_key) then
    raise exception 'הדיווח פתוח מה-1 עד ה-20 בכל חודש. החודש % סגור כעת לשינויים.', target.month_key;
  end if;
  if coalesce(p_row ->> 'leave_type', target.leave_type) <> 'none'
     and coalesce(nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date, target.leave_from) is null then
    raise exception 'יש למלא תאריך יציאה לחופשה';
  end if;

  base_changed :=
       coalesce(p_row ->> 'reform',     target.reform)     is distinct from target.reform
    or coalesce(p_row ->> 'level',      target.level)      is distinct from target.level
    or coalesce(p_row ->> 'degree',     target.degree)     is distinct from target.degree
    or coalesce(p_row ->> 'grade',      target.grade)      is distinct from target.grade
    or coalesce(p_row ->> 'gamul_role', target.gamul_role) is distinct from target.gamul_role
    or coalesce(p_row ->> 'age_group',  target.age_group)  is distinct from target.age_group
    or coalesce(p_row ->> 'job',        target.job)        is distinct from target.job
    or (p_row ? 'extra_roles' and
        array(select jsonb_array_elements_text(case when jsonb_typeof(p_row -> 'extra_roles') = 'array' then p_row -> 'extra_roles' else '[]'::jsonb end))
          is distinct from target.extra_roles)
    or coalesce(p_row ->> 'leave_type', target.leave_type) is distinct from target.leave_type
    or coalesce(nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date, target.leave_from) is distinct from target.leave_from
    or coalesce(nullif(btrim(coalesce(p_row ->> 'leave_to',   '')), '')::date, target.leave_to)   is distinct from target.leave_to
    or coalesce(nullif(btrim(coalesce(p_row ->> 'nihul_grade', '')), '')::smallint, target.nihul_grade) is distinct from target.nihul_grade
    or coalesce((p_row ->> 'seniority')::int,         target.seniority)         is distinct from target.seniority
    or coalesce((p_row ->> 'frontal_hours')::int,     target.frontal_hours)     is distinct from target.frontal_hours
    or coalesce((p_row ->> 'scope_pct')::int,         target.scope_pct)         is distinct from target.scope_pct
    or coalesce((p_row ->> 'children_under_18')::int, target.children_under_18) is distinct from target.children_under_18;

  perform set_config('app.via_link', '1', true);

  update public.teacher_months set
    name              = coalesce(p_row ->> 'name', name),
    tz_id             = coalesce(p_row ->> 'tz_id', tz_id),
    email             = coalesce(p_row ->> 'email', email),
    phone             = coalesce(p_row ->> 'phone', phone),
    reform            = coalesce(p_row ->> 'reform', reform),
    level             = coalesce(p_row ->> 'level', level),
    grade             = coalesce(p_row ->> 'grade', grade),
    degree            = coalesce(p_row ->> 'degree', degree),
    job               = coalesce(p_row ->> 'job', job),
    extra_roles       = case when p_row ? 'extra_roles'
                             then array(select jsonb_array_elements_text(case when jsonb_typeof(p_row -> 'extra_roles') = 'array' then p_row -> 'extra_roles' else '[]'::jsonb end))
                             else extra_roles end,
    seniority         = coalesce((p_row ->> 'seniority')::int, seniority),
    frontal_hours     = coalesce((p_row ->> 'frontal_hours')::int, frontal_hours),
    individual_hours  = case when p_row ? 'individual_hours'
                             then nullif(btrim(coalesce(p_row ->> 'individual_hours', '')), '')::smallint
                             else individual_hours end,
    presence_hours    = case when p_row ? 'presence_hours'
                             then nullif(btrim(coalesce(p_row ->> 'presence_hours', '')), '')::smallint
                             else presence_hours end,
    scope_pct         = coalesce((p_row ->> 'scope_pct')::int, scope_pct),
    gamul_role        = coalesce(p_row ->> 'gamul_role', gamul_role),
    age_group         = coalesce(p_row ->> 'age_group', age_group),
    is_temp           = coalesce((p_row ->> 'is_temp')::boolean, is_temp),
    children_under_18 = coalesce((p_row ->> 'children_under_18')::int, children_under_18),
    absence_days      = coalesce((p_row ->> 'absence_days')::int, absence_days),
    absence_hours     = coalesce((p_row ->> 'absence_hours')::int, absence_hours),
    absence_reason    = case when p_row ? 'absence_reason'
                             then nullif(btrim(coalesce(p_row ->> 'absence_reason', '')), '')
                             else absence_reason end,
    sick_form_path    = case when p_row ? 'sick_form_path'
                             then nullif(btrim(coalesce(p_row ->> 'sick_form_path', '')), '')
                             else sick_form_path end,
    mm_hours          = coalesce((p_row ->> 'mm_hours')::int, mm_hours),
    mm_for            = case when p_row ? 'mm_for'
                             then nullif(btrim(coalesce(p_row ->> 'mm_for', '')), '')
                             else mm_for end,
    mm_from           = case when p_row ? 'mm_from'
                             then nullif(btrim(coalesce(p_row ->> 'mm_from', '')), '')::date
                             else mm_from end,
    mm_to             = case when p_row ? 'mm_to'
                             then nullif(btrim(coalesce(p_row ->> 'mm_to', '')), '')::date
                             else mm_to end,
    monthly_extras    = coalesce((p_row ->> 'monthly_extras')::int, monthly_extras),
    travel_days       = coalesce((p_row ->> 'travel_days')::int, travel_days),
    daycare_children  = coalesce((p_row ->> 'daycare_children')::int, daycare_children),
    nihul_grade       = case when p_row ? 'nihul_grade'
                             then nullif(btrim(coalesce(p_row ->> 'nihul_grade', '')), '')::smallint
                             else nihul_grade end,
    leave_type        = coalesce(p_row ->> 'leave_type', leave_type),
    leave_from        = case when p_row ? 'leave_from'
                             then nullif(btrim(coalesce(p_row ->> 'leave_from', '')), '')::date
                             else leave_from end,
    leave_to          = case when p_row ? 'leave_to'
                             then nullif(btrim(coalesce(p_row ->> 'leave_to', '')), '')::date
                             else leave_to end,
    snapshot          = case when base_changed and snapshot is null
                             then p_row -> 'snapshot' else snapshot end,
    official_gross     = case when base_changed then null else official_gross end,
    official_gross_pre = case when base_changed then null else official_gross_pre end,
    approved           = case when base_changed then false else approved end,
    net_approved       = case when base_changed then false else net_approved end,
    changed_at         = case when base_changed then now() else changed_at end,
    report_pending     = true,
    report_pending_at  = now(),
    updated_at         = now()
  where id = target.id
  returning * into result;

  perform set_config('app.via_link', '', true);

  update public.access_links set last_used_at = now() where code = p_code;
  return result;
end;
$function$
;

-- ── הרשאות העמודות: ההגדרה החיה, בתוספת absence_hours לחשבת השכר ──
CREATE OR REPLACE FUNCTION private.enforce_column_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      if col = 'official_gross' and old.official_gross is null and not old.report_pending then
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
  if r = 'principal' and private.link_locked(new.month_key) then
    raise exception 'הדיווח פתוח מה-1 עד ה-20 בכל חודש. החודש % סגור כעת לשינויים.', new.month_key;
  end if;

  /*
    אישור הדיווח (שרה, 21.9.26): "אם לא אאשר לא עובר לסימולציה ... רק
    רשומה מאושרת עוברת לשכר". רק הרכזת מסמנת דיווח כמאושר; עד אז אסור
    להזין ברוטו או לאשר שכר על השורה.
  */
  if 'report_pending' = any(changed) and r <> 'coordinator'
     and not (r = 'principal' and new.report_pending) then
    raise exception 'רק שרה מאשרת דיווח של מנהלת';
  end if;
  if r = 'clerk' and old.report_pending
     and changed && array['official_gross', 'official_gross_pre', 'chabad_supp', 'approved'] then
    raise exception 'הדיווח של המנהלת ממתין לאישור שרה — אין סימולציה ואין אישור לפני כן';
  end if;

  base_changed := changed && array[
    'reform', 'grade', 'degree', 'level', 'age_group', 'seniority',
    'gamul_role', 'scope_pct', 'frontal_hours', 'children_under_18',
    'job', 'hourly_rate', 'extra_roles'
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
                 'payroll_ready', 'slip_issued_at', 'slip_gross', 'hourly_rate') then
        raise exception 'מנהלת בית ספר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'clerk' then
    foreach col in array changed loop
      if col not in (
        'official_gross', 'official_gross_pre', 'chabad_supp', 'actual_employer_cost',
        'gross_set_at', 'gross_set_by',
        'seniority', 'degree', 'grade', 'level', 'age_group', 'gamul_role', 'extra_roles', 'reform',
        'slip_issued_at', 'slip_gross',
        'individual_hours', 'presence_hours',
        'absence_days', 'absence_hours', 'absence_reason', 'sick_form_path', 'mm_hours', 'mm_for', 'mm_from', 'mm_to',
        -- משרה שעתית: התעריף הוא שכר, והוא שלה (15.9)
        'hourly_rate',
        'approved', 'approved_at', 'approved_by', 'changed_at', 'snapshot', 'updated_at'
      ) then
        raise exception 'חשבת שכר אינה רשאית לשנות %', private.col_label(col);
      end if;
    end loop;

  elsif r = 'network' then
    raise exception 'התפקיד הזה אינו מעדכן שורות שכר';
  end if;

  -- כל שינוי של מנהלת בכניסה רגילה הוא דיווח שממתין לאישור
  if r = 'principal' then
    new.report_pending := true;
    new.report_pending_at := now();
  end if;

  if new.approved and not old.approved then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;

notify pgrst, 'reload schema';
