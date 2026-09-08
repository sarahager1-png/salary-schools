/*
  ההצהרה שעליה המנהלת חותמת (שרה, 8.9):
  "אני מאשרת שזהו מספר השעות לשנה זו ולא אחרוג מכך."

  זו לא פרוצדורה אלא התחייבות, ולכן היא נשמרת עם האישור ולא רק מוצגת
  במסך: `declaration` מחזיקה את הנוסח המדויק שהוצג באותו רגע, ו-
  `hours_committed` את מספר השעות שעליו נחתם. שניהם נכתבים בשרת מתוך
  הנתונים עצמם — כדי שלא יהיה אפשר לאשר מספר אחד ולהציג אחר.

  הרקע: בבדיקת 8.9 נמצאו 109 שעות שבועיות מעל המתוכנן בחמישה בתי ספר
  (רעננה +40, גני תקווה +36, אשקלון +18, ירושלים +14). בלי מספר חתום
  אין למה להשוות כשהחריגה מתגלה באמצע השנה.
*/
alter table public.school_data_approval
  add column if not exists declaration     text,
  add column if not exists hours_committed numeric;

/* סך השעות הפרונטליות שעליהן חותמים — בלי שורת המנהלת */
create or replace function public.p_hours_of(p_school uuid, p_month text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(t.frontal_hours), 0)
  from public.teacher_months t
  where t.school_id = p_school and t.month_key = p_month
    and coalesce(t.gamul_role, '') <> 'principal'
    and coalesce(t.leave_type, 'none') not in ('maternity', 'unpaid');
$$;

create or replace function public.link_approve_data(p_code text, p_name text, p_note text default null)
returns public.school_data_approval
language plpgsql security definer set search_path = ''
as $$
declare pr record; v_month text; n_rows int; n_checked int; v_hours numeric;
        v_decl text; out_row public.school_data_approval;
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
  -- to_char עם FM משאיר נקודה תלויה במספר שלם ("107."). מספר שלם נכתב כשלם.
  v_decl := 'אני מאשרת שהפרטים נכונים ומעודכנים, ושזהו מספר השעות לשנה זו — '
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

/*
  חריגה מההתחייבות — למי שנחתם לו מספר, וכמה השעות עומדות עליו היום.
  זו השאלה שההצהרה נועדה לענות עליה, ולכן היא חיה כאן ולא בסקריפט.
*/
create or replace function public.hours_vs_committed(p_month text)
returns table(school_id uuid, school_name text, approved_at timestamptz, approved_by text,
              hours_committed numeric, hours_now numeric, diff numeric)
language sql stable security definer set search_path = ''
as $$
  select a.school_id, s.name, a.approved_at, a.approved_by,
         a.hours_committed, public.p_hours_of(a.school_id, a.month_key),
         public.p_hours_of(a.school_id, a.month_key) - a.hours_committed
  from public.school_data_approval a
  join public.schools s on s.id = a.school_id
  where a.month_key = p_month and a.hours_committed is not null
  order by (public.p_hours_of(a.school_id, a.month_key) - a.hours_committed) desc;
$$;

revoke all on function public.p_hours_of(uuid, text) from public;
revoke all on function public.hours_vs_committed(text) from public;
grant execute on function public.p_hours_of(uuid, text) to anon, authenticated;
grant execute on function public.hours_vs_committed(text) to authenticated;

notify pgrst, 'reload schema';
