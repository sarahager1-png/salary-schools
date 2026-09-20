-- הקשחת כתבי הסילוק — ממצאי ביקורת הקוד של 20.9 (אחרי הפריסה הראשונה, לפני
-- שמישהו חתם). העיקר: מסמך משפטי נבנה ונאכף בשרת, לא בדפדפן.
--
--   1. rl_sign בונה את fields בעצמו: מה שהצוות קבע ב-doc גובר תמיד על מה
--      שהגיע מהלקוח, ושדות החובה נבדקים כאן ולא רק במסך. קודם נשמר p_fields
--      כפי שהגיע — עובד יכול היה לשנות את תאריך הסיום ששרה קבעה ולחתום.
--   2. ת"ז שהוקלדה לא דורסת tz_id שהצוות רשם (הוא מפתח ה-dedup).
--   3. rl_upload: הקובץ חייב להתקיים בדלי; לא אחרי חתימה דיגיטלית ולא אחרי
--      שהצוות אישר את הטופס. טופס שהועלה ממתין לבדיקת הצוות (upload_verified_at)
--      ואינו נספר "הושלם" מעצמו.
--   4. רשומה חתומה נעולה גם מפני הצוות: טריגר חוסם שינוי של ערך חתום ומחיקה.
--   5. מגבלות גודל וסוג על הדלי; אינדקס ייחודי נגד קישור כפול לאותו עובד.
--   6. כתובת ה-IP: מהכותרת שהשער קובע, לא מהאיבר הראשון של x-forwarded-for
--      שהחותם שולט בו; הערך הגולמי נשמר לצידה.

alter table public.release_letters
  add column if not exists upload_verified_at timestamptz,
  add column if not exists upload_verified_by uuid;

create unique index if not exists release_letters_school_tz_uidx
  on public.release_letters (school_id, tz_id) where not revoked and tz_id is not null;

update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/heic','image/heif','image/webp','application/pdf']
  where id = 'release-letters';

-- פרטי הבקשה לרישום: IP מהשער, והכותרת הגולמית לצידו
create or replace function private.rl_request_meta(p_user_agent text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare hdr json; xff text; ip text;
begin
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  xff := coalesce(hdr ->> 'x-forwarded-for', '');
  ip := coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(hdr ->> 'x-real-ip', ''),
                 nullif(trim(split_part(xff, ',', 1)), ''));
  begin perform ip::inet; exception when others then ip := null; end;
  return jsonb_build_object('ip', ip, 'xff', left(xff, 200),
    'user_agent', left(coalesce(nullif(hdr ->> 'user-agent', ''), p_user_agent, ''), 300));
end;
$$;
revoke all on function private.rl_request_meta(text) from public, anon, authenticated;

create or replace function public.rl_sign(p_code text, p_fields jsonb, p_signature_path text, p_signature_data text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.release_letters; f jsonb; tz text; v_from text; v_to text;
  pick text[] := array['employer_name','employerName','employer_num','employerNum','workplace','workplace',
                       'place','place','from_date','from','to_date','to','role','role'];
  i int; val text;
begin
  if coalesce(p_signature_path, '') = '' or split_part(p_signature_path, '/', 1) <> p_code then
    raise exception 'חסרה חתימה';
  end if;
  if coalesce(p_signature_data, '') not like 'data:image/png;base64,%' or length(p_signature_data) > 400000 then
    raise exception 'חסרה חתימה';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or length(p_fields::text) > 4000 then
    raise exception 'פרטי המסמך אינם תקינים';
  end if;

  select * into r from public.release_letters where code = p_code and not revoked for update;
  if r.id is null then raise exception 'הקישור אינו תקף'; end if;
  if r.signed_at is not null then raise exception 'המסמך כבר נחתם'; end if;

  -- המסמך נבנה כאן: ערך שהצוות קבע גובר; רק מה שחסר נלקח מהעובד
  f := jsonb_build_object('name', r.name, 'docVersion', 1);
  for i in 1 .. array_length(pick, 1) / 2 loop
    val := coalesce(nullif(trim(r.doc ->> pick[i * 2 - 1]), ''), left(trim(coalesce(p_fields ->> pick[i * 2], '')), 120));
    f := f || jsonb_build_object(pick[i * 2], val);
  end loop;
  tz := regexp_replace(coalesce(p_fields ->> 'tz', ''), '\D', '', 'g');
  if length(tz) not between 8 and 9 then raise exception 'יש למלא מספר זהות מלא'; end if;
  f := f || jsonb_build_object('tz', tz);

  v_from := f ->> 'from'; v_to := f ->> 'to';
  if v_from !~ '^\d{4}-\d{2}-\d{2}$' or v_to !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'יש למלא את תאריכי תקופת העבודה'; end if;
  if v_from > v_to then raise exception 'תאריך הסיום קודם לתאריך ההתחלה'; end if;
  if coalesce(f ->> 'role', '') = '' then raise exception 'יש למלא תפקיד'; end if;
  if coalesce(f ->> 'employerName', '') = '' then raise exception 'יש למלא את שם העמותה'; end if;

  update public.release_letters set
    fields = f,
    -- לא דורסים ת"ז שהצוות רשם. שורה בלי ת"ז מקבלת את מה שהוקלד — אלא אם
    -- הוא כבר רשום לעובד אחר באותו בית ספר (האינדקס הייחודי היה מפיל את
    -- החתימה עצמה בהודעת "הרשומה כבר קיימת"). הת"ז כפי שהוקלדה נשמרת ב-fields בכל מקרה.
    tz_id = coalesce(tz_id, case when exists (
              select 1 from public.release_letters o
              where o.school_id = r.school_id and o.tz_id = tz and not o.revoked and o.id <> r.id)
            then null else tz end),
    signature_path = p_signature_path,
    signature_data = p_signature_data,
    signed_at = now(),
    not_employed_at = null,                -- החתימה גוברת על הצהרה קודמת
    sign_meta = private.rl_request_meta(p_user_agent),
    updated_at = now(), last_used_at = now()
  where id = r.id;
end;
$$;

create or replace function public.rl_upload(p_code text, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_path, '') = '' or split_part(p_path, '/', 1) <> p_code then
    raise exception 'חסר קובץ';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'release-letters' and o.name = p_path) then
    raise exception 'הקובץ לא נקלט — נסו להעלות שוב';
  end if;
  update public.release_letters set
    upload_path = p_path, uploaded_at = now(), not_employed_at = null,
    updated_at = now(), last_used_at = now()
  where code = p_code and not revoked and signed_at is null and upload_verified_at is null;
  if not found then raise exception 'הקישור אינו תקף, או שכבר התקבל מסמך'; end if;
end;
$$;

create or replace function public.rl_lawyer_sign(p_lcode text, p_name text, p_license text, p_signature_data text, p_stamp_data text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'יש למלא שם מלא'; end if;
  if length(regexp_replace(coalesce(p_license, ''), '\D', '', 'g')) < 3 then raise exception 'יש למלא מספר רישיון'; end if;
  if coalesce(p_signature_data, '') not like 'data:image/png;base64,%' or length(p_signature_data) > 400000 then
    raise exception 'חסרה חתימה';
  end if;
  if coalesce(p_stamp_data, '') !~ '^data:image/(jpeg|png);base64,' or length(p_stamp_data) > 700000 then
    raise exception 'חסרה חותמת עורך הדין';
  end if;
  update public.release_letters set
    lawyer_name = left(trim(p_name), 80), lawyer_license = left(trim(p_license), 20),
    lawyer_signature_data = p_signature_data, lawyer_stamp_data = p_stamp_data, lawyer_signed_at = now(),
    lawyer_meta = private.rl_request_meta(p_user_agent),
    updated_at = now()
  where lawyer_code = p_lcode and not revoked and signed_at is not null and lawyer_signed_at is null;
  if not found then raise exception 'הקישור אינו תקף, או שהאישור כבר ניתן'; end if;
end;
$$;

-- הצוות מאשר שבדק את הטופס שהועלה (חתימה + עו"ד + חותמת על הנייר)
create or replace function public.rl_verify_upload(p_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.my_role() is distinct from 'coordinator' then raise exception 'אין לך הרשאה לפעולה הזו'; end if;
  update public.release_letters set
    upload_verified_at = case when p_on then now() else null end,
    upload_verified_by = case when p_on then auth.uid() else null end,
    updated_at = now()
  where id = p_id and upload_path is not null;
  if not found then raise exception 'לא נמצא טופס שהועלה'; end if;
end;
$$;
revoke all on function public.rl_verify_upload(uuid, boolean) from public, anon;
grant execute on function public.rl_verify_upload(uuid, boolean) to authenticated;

/*
  נעילת רשומה חתומה — גם מפני הצוות וגם מפני מפתח השרת. מותר מעבר מ-NULL
  לערך (כך פונקציות rl_* חותמות), אסור שינוי של ערך חתום קיים, ואסורה מחיקה
  של רשומה שיש בה חתימה או טופס. revoked / phone / doc-לפני-חתימה נשארים פתוחים.
*/
create or replace function private.rl_lock_signed()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null or old.upload_path is not null then
      raise exception 'אי אפשר למחוק כתב סילוק שנחתם או שהועלה לו טופס — אפשר רק לבטל את הקישור';
    end if;
    return old;
  end if;
  if old.signed_at is not null and (
       new.signed_at is distinct from old.signed_at or new.fields is distinct from old.fields
    or new.signature_data is distinct from old.signature_data or new.signature_path is distinct from old.signature_path
    or new.sign_meta is distinct from old.sign_meta or new.doc is distinct from old.doc
    or new.name is distinct from old.name or new.school_id is distinct from old.school_id) then
    raise exception 'מסמך חתום אינו ניתן לשינוי';
  end if;
  if old.lawyer_signed_at is not null and (
       new.lawyer_signed_at is distinct from old.lawyer_signed_at or new.lawyer_name is distinct from old.lawyer_name
    or new.lawyer_license is distinct from old.lawyer_license or new.lawyer_signature_data is distinct from old.lawyer_signature_data
    or new.lawyer_stamp_data is distinct from old.lawyer_stamp_data or new.lawyer_meta is distinct from old.lawyer_meta) then
    raise exception 'אישור עורך הדין אינו ניתן לשינוי';
  end if;
  return new;
end;
$$;
drop trigger if exists rl_lock_signed on public.release_letters;
create trigger rl_lock_signed before update or delete on public.release_letters
  for each row execute function private.rl_lock_signed();

notify pgrst, 'reload schema';
