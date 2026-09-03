-- מסירת התלושים (שרה, 4.9): "כשחשבת שכר מסיימת לכתוב תלושים תהיה לה
-- אפשרות להודיע לי, וכשאסיים לעבור אכתוב לה שאושר."
-- שני חותמות על החודש + הודעת וואטסאפ דרך תור ה-notifications הקיים.
alter table public.months
  add column if not exists slips_done_at     timestamptz,
  add column if not exists slips_approved_at timestamptz;

create or replace function public.slips_handoff(p_month text, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := private.my_role();
  v_phone text;
  v_label text;
begin
  select to_char(to_date(p_month || '-01', 'YYYY-MM-DD'), 'MM/YYYY') into v_label;

  if p_action = 'done' then
    if v_role not in ('clerk', 'coordinator') then
      raise exception 'רק חשבת השכר מסמנת סיום תלושים';
    end if;
    update public.months set slips_done_at = now() where key = p_month;
    if not found then raise exception 'החודש % אינו קיים', p_month; end if;
    -- ההודעה לשרה — לפי הטלפון בפרופיל שלה, לא מספר קשיח
    select phone into v_phone from public.profiles
     where role = 'coordinator' and full_name = 'שרה הגר' and phone is not null limit 1;
    if v_phone is not null then
      insert into public.notifications (kind, to_phone, to_name, month_key, body)
      values ('slips_done', v_phone, 'שרה הגר', p_month,
        'חשבת השכר סיימה להזין את התלושים לחודש ' || v_label ||
        '. אפשר לעבור ולאשר במערכת השכר.');
    end if;

  elsif p_action = 'approve' then
    if v_role <> 'coordinator' then
      raise exception 'רק שרה מאשרת את התלושים';
    end if;
    update public.months set slips_approved_at = now() where key = p_month;
    if not found then raise exception 'החודש % אינו קיים', p_month; end if;
    select phone into v_phone from public.profiles
     where role = 'clerk' and phone is not null limit 1;
    if v_phone is not null then
      insert into public.notifications (kind, to_phone, to_name, month_key, body)
      values ('slips_approved', v_phone, 'חשבת השכר', p_month,
        'שרה עברה על התלושים של ' || v_label || ' — מאושר ✓ תודה רבה!');
    end if;

  else
    raise exception 'פעולה לא מוכרת: %', p_action;
  end if;
end;
$$;
revoke all on function public.slips_handoff(text, text) from public, anon;
grant execute on function public.slips_handoff(text, text) to authenticated;
