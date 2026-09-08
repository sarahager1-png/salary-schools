/*
  אישור נתונים על ידי המנהלת (שרה, 8.9).

  עד היום המנהלת יכלה לערוך את נתוני ההעסקה דרך הקישור שלה, אבל לא היה
  שום רגע שבו היא אומרת "עברתי, זה נכון". דפי ה-PDF נתנו לה לעבור אבל
  לא להחזיר — ולכן האישור נוסף כאן, במערכת, ומסתנכרן מיד.

  "כל נתון שיבדקו" (שרה, 8.9): האישור אינו לחיצה אחת על הכל. כל עובדת
  מאושרת בנפרד, אחרי שהשורה שלה נפרשה, והאישור הכולל נפתח רק כשכולן
  סומנו. `checked` שומר אילו שורות סומנו, כדי שסימון חלקי לא ילך לאיבוד
  בין כניסה לכניסה.

  כל שינוי בנתון שהמנהלת רואה **מבטל** את האישור: אחרת האישור מעיד על
  נתונים שכבר אינם. הביטול נרשם ולא נמחק, כדי שיישאר עקבות מה שבר אותו.
  שינוי של חשבת השכר בברוטו או בעלות אינו מבטל — הוא אינו נתון שלה.
*/
create table if not exists public.school_data_approval (
  school_id    uuid not null references public.schools(id) on delete cascade,
  month_key    text not null,
  checked      jsonb not null default '[]'::jsonb,   -- מזהי שורות שנבדקו
  approved_at  timestamptz,
  approved_by  text,
  note         text,
  revoked_at   timestamptz,
  revoked_rows text,
  updated_at   timestamptz not null default now(),
  primary key (school_id, month_key)
);

alter table public.school_data_approval enable row level security;
drop policy if exists sda_read on public.school_data_approval;
create policy sda_read on public.school_data_approval for select to authenticated using (true);

/* החודש שעליו חותמים — האחרון שקיים לבית הספר, כמו ב-link_months */
create or replace function public.p_month_of(p_code text)
returns text
language sql stable security definer set search_path = ''
as $$
  select max(tm.month_key)
  from private.profile_for_code(p_code) pr
  join public.teacher_months tm on tm.school_id = pr.school_id;
$$;

/* סימון שורה בודדת כנבדקה, או ביטול סימון */
create or replace function public.link_check_row(p_code text, p_row uuid, p_on boolean)
returns public.school_data_approval
language plpgsql security definer set search_path = ''
as $$
declare pr record; v_month text; out_row public.school_data_approval;
begin
  select * into pr from private.profile_for_code(p_code);
  if pr is null or pr.role <> 'principal' then raise exception 'הקישור אינו של מנהלת בית ספר'; end if;
  v_month := public.p_month_of(p_code);
  if not exists (select 1 from public.teacher_months t
                 where t.id = p_row and t.school_id = pr.school_id and t.month_key = v_month) then
    raise exception 'השורה אינה שייכת לבית הספר';
  end if;

  insert into public.school_data_approval (school_id, month_key, checked, updated_at)
  values (pr.school_id, v_month, case when p_on then jsonb_build_array(p_row::text) else '[]'::jsonb end, now())
  on conflict (school_id, month_key) do update set
    checked = case
      when p_on then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                      from jsonb_array_elements(public.school_data_approval.checked || jsonb_build_array(p_row::text)) x)
      else (select coalesce(jsonb_agg(x), '[]'::jsonb)
            from jsonb_array_elements(public.school_data_approval.checked) x
            where x <> to_jsonb(p_row::text))
    end,
    updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;

/* האישור הסופי — נפתח רק כשכל השורות סומנו */
create or replace function public.link_approve_data(p_code text, p_name text, p_note text default null)
returns public.school_data_approval
language plpgsql security definer set search_path = ''
as $$
declare pr record; v_month text; n_rows int; n_checked int; out_row public.school_data_approval;
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

  insert into public.school_data_approval (school_id, month_key, approved_at, approved_by, note, revoked_at, revoked_rows, updated_at)
  values (pr.school_id, v_month, now(), trim(p_name), nullif(trim(coalesce(p_note, '')), ''), null, null, now())
  on conflict (school_id, month_key) do update
    set approved_at = now(), approved_by = excluded.approved_by, note = excluded.note,
        revoked_at = null, revoked_rows = null, updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;

/* קריאת מצב האישור מהקישור */
create or replace function public.link_approval(p_code text)
returns public.school_data_approval
language sql stable security definer set search_path = ''
as $$
  select a.* from private.profile_for_code(p_code) pr
  join public.school_data_approval a
    on a.school_id = pr.school_id and a.month_key = public.p_month_of(p_code)
  where pr.role = 'principal';
$$;

/*
  ביטול אוטומטי בשינוי. השדות הם בדיוק אלה שהמנהלת רואה בדף האישור —
  שינוי ברוטו או עלות מעביד של החשבת אינו נוגע לזה. השורה שסימנה
  יורדת מהסימון, כדי שתחזור לעבור עליה בפרט ולא על כולן מחדש.
*/
create or replace function private.revoke_approval_on_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sch uuid; v_month text; v_name text; v_id uuid;
begin
  v_sch := coalesce(new.school_id, old.school_id);
  v_month := coalesce(new.month_key, old.month_key);
  v_name := coalesce(new.name, old.name);
  v_id := coalesce(new.id, old.id);

  if tg_op = 'UPDATE' and not (
       new.name is distinct from old.name or new.tz_id is distinct from old.tz_id
    or new.phone is distinct from old.phone or new.email is distinct from old.email
    or new.reform is distinct from old.reform or new.level is distinct from old.level
    or new.degree is distinct from old.degree or new.grade is distinct from old.grade
    or new.seniority is distinct from old.seniority or new.frontal_hours is distinct from old.frontal_hours
    or new.gamul_role is distinct from old.gamul_role or new.children_under_18 is distinct from old.children_under_18
    or new.gender is distinct from old.gender or new.age_group is distinct from old.age_group
    or new.is_temp is distinct from old.is_temp or new.nihul_grade is distinct from old.nihul_grade
    or new.scope_pct is distinct from old.scope_pct
  ) then
    return new;
  end if;

  -- `case when … then null else null end` נותן text ב-PostgreSQL ונפל על
  -- טיפוס approved_at. פשוט null.
  update public.school_data_approval a
     set approved_at = null,
         revoked_at  = case when a.approved_at is not null then now() else a.revoked_at end,
         revoked_rows = case when a.approved_at is not null then v_name else a.revoked_rows end,
         checked = (select coalesce(jsonb_agg(x), '[]'::jsonb)
                    from jsonb_array_elements(a.checked) x where x <> to_jsonb(v_id::text)),
         updated_at = now()
   where a.school_id = v_sch and a.month_key = v_month;
  return new;
end;
$$;

drop trigger if exists trg_revoke_approval on public.teacher_months;
create trigger trg_revoke_approval
  after insert or update or delete on public.teacher_months
  for each row execute function private.revoke_approval_on_change();

/*
  "חשוב שנדע מה תוקן" (שרה, 8.9). audit_log ידע עד היום לספר שמשהו
  אושר או נוצר, אבל לא איזה שדה זז ומה היה בו קודם. הטריגר הזה רושם
  שורה לכל שדה שהשתנה, עם הערך הישן והחדש — כדי שאחרי סבב האישור
  אפשר יהיה לראות בדיוק מה המנהלות תיקנו, ולא רק שהן אישרו.
*/
create or replace function private.log_data_fix()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f text;
  old_v text; new_v text;
  via boolean := coalesce(current_setting('app.via_link', true), '') = '1';
  fields text[] := array['name','tz_id','phone','email','reform','level','degree','grade',
                         'seniority','frontal_hours','gamul_role','children_under_18',
                         'gender','age_group','is_temp','nihul_grade'];
begin
  foreach f in array fields loop
    old_v := to_jsonb(old) ->> f;
    new_v := to_jsonb(new) ->> f;
    if new_v is distinct from old_v then
      insert into public.audit_log (actor, actor_role, row_id, month_key, action, detail)
      values (auth.uid(), null, new.id, new.month_key, 'data_fixed',
              jsonb_build_object('field', f, 'from', old_v, 'to', new_v,
                                 'name', new.name, 'school_id', new.school_id,
                                 'via_link', via));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_log_data_fix on public.teacher_months;
create trigger trg_log_data_fix
  after update on public.teacher_months
  for each row execute function private.log_data_fix();

/* מה תוקן — לבית ספר ולחודש. לשרה ולחשבת, מהמערכת המחוברת. */
create or replace function public.data_fixes(p_month text)
returns table(at timestamptz, school_id uuid, school_name text, teacher text,
              field text, from_val text, to_val text, via_link boolean)
language sql stable security definer set search_path = ''
as $$
  select l.at,
         (l.detail ->> 'school_id')::uuid, s.name,
         l.detail ->> 'name', l.detail ->> 'field',
         l.detail ->> 'from', l.detail ->> 'to',
         coalesce((l.detail ->> 'via_link')::boolean, false)
  from public.audit_log l
  left join public.schools s on s.id = (l.detail ->> 'school_id')::uuid
  where l.action = 'data_fixed' and l.month_key = p_month
  order by l.at desc;
$$;
revoke all on function public.data_fixes(text) from public;
grant execute on function public.data_fixes(text) to authenticated;

revoke all on function public.link_approve_data(text, text, text) from public;
revoke all on function public.link_check_row(text, uuid, boolean) from public;
revoke all on function public.link_approval(text) from public;
revoke all on function public.p_month_of(text) from public;
grant execute on function public.link_approve_data(text, text, text) to anon, authenticated;
grant execute on function public.link_check_row(text, uuid, boolean) to anon, authenticated;
grant execute on function public.link_approval(text) to anon, authenticated;
grant execute on function public.p_month_of(text) to anon, authenticated;

notify pgrst, 'reload schema';
