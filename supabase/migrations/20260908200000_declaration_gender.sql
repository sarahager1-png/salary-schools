/*
  ההצהרה בלשון המאשר/ת (שרה, 8.9).

  הנוסח נכתב בלשון נקבה בלבד, ובעפולה המנהל הוא גבר — "אני מאשרת"
  היה נראה לו כמו טופס של מישהי אחרת. הלשון נגזרת מ-`profiles.gender`
  של בעל/ת הקישור, ולא מנחשים: בהיעדר סימון נשארת לשון נקבה, שהיא
  הרוב המוחלט ברשת.
*/
create or replace function public.link_approve_data(p_code text, p_name text, p_note text default null)
returns public.school_data_approval
language plpgsql security definer set search_path = ''
as $$
declare pr record; v_month text; n_rows int; n_checked int; v_hours numeric;
        v_decl text; v_male boolean; out_row public.school_data_approval;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr is null or pr.role <> 'principal' then raise exception 'הקישור אינו של מנהלת בית ספר'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'יש למלא שם מאשרת'; end if;
  v_month := public.p_month_of(p_code);

  select count(*) into n_rows from public.teacher_months t
   where t.school_id = pr.school_id and t.month_key = v_month;
  select count(*) into n_checked
    from public.school_data_approval a, jsonb_array_elements_text(a.checked) c
   where a.school_id = pr.school_id and a.month_key = v_month
     and exists (select 1 from public.teacher_months t
                 where t.id = c::uuid and t.school_id = pr.school_id and t.month_key = v_month);
  if n_checked < n_rows then
    raise exception 'נבדקו % מתוך % עובדות — יש לעבור על כולן', n_checked, n_rows;
  end if;

  v_hours := public.p_hours_of(pr.school_id, v_month);
  v_male := coalesce(pr.gender, '') = 'm';
  -- to_char עם FM משאיר נקודה תלויה במספר שלם ("107."). מספר שלם נכתב כשלם.
  v_decl := case when v_male then 'אני מאשר שהפרטים נכונים ומעודכנים, ושזהו מספר השעות לשנה זו — '
                 else 'אני מאשרת שהפרטים נכונים ומעודכנים, ושזהו מספר השעות לשנה זו — ' end
            || case when v_hours = trunc(v_hours) then v_hours::bigint::text
                    else trim(to_char(v_hours, 'FM999990.99')) end
            || ' שעות שבועיות — ולא אחרוג מכך.';

  insert into public.school_data_approval
    (school_id, month_key, approved_at, approved_by, note, declaration, hours_committed,
     revoked_at, revoked_rows, updated_at)
  values (pr.school_id, v_month, now(), trim(p_name), nullif(trim(coalesce(p_note, '')), ''),
          v_decl, v_hours, null, null, now())
  on conflict (school_id, month_key) do update
    set approved_at = now(), approved_by = excluded.approved_by, note = excluded.note,
        declaration = excluded.declaration, hours_committed = excluded.hours_committed,
        revoked_at = null, revoked_rows = null, updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;

revoke all on function public.link_approve_data(text, text, text) from public;
grant execute on function public.link_approve_data(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
