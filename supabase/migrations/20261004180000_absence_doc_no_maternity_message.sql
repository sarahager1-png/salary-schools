/*
  חופשת לידה: בלי הודעה ליולדת (שרה, 4.10.26).

  "מנהלת תדאג לצרף, גם אמורה לדאוג לאישורים." בחופשת לידה האחריות להשיג
  את האישור ולצרף אותו היא של המנהלת, ולכן היולדת אינה מקבלת את ההודעה
  "עליך לשלוח אישור". בשאר הסיבות (מחלה, מחלת ילד, מילואים, חל"ת, אחר)
  ההודעה לעובדת נשארת כפי שנקבעה באותו יום.

  שני שינויים בפונקציה: (1) שורה של חופשת לידה מטופלת כמו שורה שכבר יש
  לה אישור — הודעה שממתינה מתבטלת, וחדשה לא נוצרת; (2) דיווח שתוקן
  מחופשת לידה לסיבה אחרת נחשב היעדרות חדשה, והעובדת מקבלת הודעה. שאר
  הגוף הוא ההגדרה החיה כלשונה.
*/
CREATE OR REPLACE FUNCTION private.notify_absence_doc()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- חופשת לידה: המנהלת דואגת לאישור ולצירופו, והיולדת אינה מקבלת הודעה
  if new.sick_form_path is not null or not has_abs
     or new.leave_type = 'maternity' or coalesce(new.absence_reason, '') = 'maternity' then
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
    -- חופשת לידה אינה נחשבת "היעדרות שכבר דווחה": דיווח שתוקן מחופשת לידה
    -- לסיבה אחרת הוא היעדרות חדשה לעניין ההודעה
    had_abs := (old.absence_reason is not null or old.absence_days > 0
            or old.absence_hours > 0 or old.leave_type <> 'none')
           and not (old.leave_type = 'maternity' or coalesce(old.absence_reason, '') = 'maternity');
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
$function$
;

-- הודעה ליולדת שכבר נכנסה לתור ועוד לא יצאה — מתבטלת
update public.notifications n
   set status = 'cancelled'
  from public.teacher_months t
 where n.kind = 'absence_doc_needed' and n.status = 'pending' and n.teacher_id = t.id
   and (t.leave_type = 'maternity' or coalesce(t.absence_reason, '') = 'maternity');
