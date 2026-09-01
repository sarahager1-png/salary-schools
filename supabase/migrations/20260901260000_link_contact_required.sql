-- טלפון ומייל חובה בפעולות מהקישור האישי — הוולידציה שאבדה בדרך.
--
-- היא ישבה בגוף link_add_row/link_save_row (20260827134900), ונמחקה
-- כשהפונקציות הוגדרו מחדש ב-29.8 בלי הבלוק הזה. smoke-phone צעקה,
-- ובצדק: מורה בלי טלפון ומייל אי אפשר לשלוח לה את הטפסים לחתימה,
-- ומאז 1.9 זו הדרך היחידה שלה לקבל שכר.
--
-- הפעם לא משכתבים את הפונקציות — שכתוב-מחדש הוא בדיוק איך שהוולידציה
-- אבדה — אלא טריגר נפרד שנאחז בסימן שהפונקציות כבר מציבות,
-- app.via_link. עריכות של שרה או חשבת השכר אינן נחסמות: תיקון נתונים
-- במשרד אינו טופס הרשמה.
create or replace function private.enforce_link_contact()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(coalesce(new.phone, '')), '');
  v_email text := nullif(btrim(coalesce(new.email, '')), '');
begin
  if coalesce(current_setting('app.via_link', true), '') <> '1' then
    return new;
  end if;
  if v_phone is null and (tg_op = 'INSERT' or new.phone is distinct from old.phone) then
    raise exception 'יש למלא טלפון — בלעדיו אי אפשר לשלוח את נתוני ההעסקה לחתימה';
  end if;
  if v_email is null and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    raise exception 'יש למלא מייל — בלעדיו אי אפשר לשלוח את נתוני ההעסקה לחתימה';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$' then
    raise exception 'כתובת המייל אינה תקינה';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_contact on public.teacher_months;
create trigger trg_link_contact
  before insert or update on public.teacher_months
  for each row execute function private.enforce_link_contact();
