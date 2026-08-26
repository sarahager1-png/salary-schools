-- בדיקת ההרשאות בפועל. מדמה כל תפקיד מול הכללים ומחזירה עבר/נכשל.
-- מריצים כך:  npx supabase db query --linked -f supabase/rls-test.sql

create or replace function private.rls_test()
returns table(status text, check_name text)
language plpgsql
as $fn$
declare
  u_coord uuid := '11111111-1111-1111-1111-111111111111';
  u_clerk uuid := '22222222-2222-2222-2222-222222222222';
  u_prin1 uuid := '33333333-3333-3333-3333-333333333333';
  u_prin2 uuid := '44444444-4444-4444-4444-444444444444';
  u_net   uuid := '55555555-5555-5555-5555-555555555555';
  s1 uuid; s2 uuid; t1 uuid;
  n int;
  st text[] := '{}';
  nm text[] := '{}';

  procedure_dummy int;
begin
  -- ── נתוני בדיקה, בהרשאות מלאות ──
  delete from public.audit_log;
  delete from public.teacher_months;
  delete from public.profiles where id in (u_coord,u_clerk,u_prin1,u_prin2,u_net);
  delete from public.months  where key = '2099-01';
  delete from public.schools where name like 'בדיקה%';
  delete from auth.users where id in (u_coord,u_clerk,u_prin1,u_prin2,u_net);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'rlstest-' || x || '@example.com', '', now(), now(), now()
  from unnest(array[u_coord,u_clerk,u_prin1,u_prin2,u_net]) x;

  insert into public.schools (name, city, reform, hours_quota)
    values ('בדיקה א', 'עיר', 'ofek', 180) returning id into s1;
  insert into public.schools (name, city, reform)
    values ('בדיקה ב', 'עיר', 'pre') returning id into s2;
  insert into public.months (key) values ('2099-01');

  insert into public.profiles (id, full_name, role, school_id) values
    (u_coord, 'שליח',    'coordinator', null),
    (u_clerk, 'חשבת',    'clerk',       null),
    (u_prin1, 'מנהלת א', 'principal',   s1),
    (u_prin2, 'מנהלת ב', 'principal',   s2),
    (u_net,   'רינה',    'network',     null);

  insert into public.teacher_months (month_key, school_id, name, official_gross, official_gross_pre)
    values ('2099-01', s1, 'מורה בבדיקה א', 12500, 11200) returning id into t1;

  -- ═══ 1. מנהלת רואה רק את בית הספר שלה ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_prin1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.teacher_months;
  reset role;
  st := array_append(st, (case when n = 1 then 'PASS' else 'FAIL' end));
  nm := array_append(nm, 'מנהלת א רואה את בית ספרה');

  perform set_config('request.jwt.claims', json_build_object('sub', u_prin2, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.teacher_months;
  reset role;
  st := array_append(st, (case when n = 0 then 'PASS' else 'FAIL' end));
  nm := array_append(nm, 'מנהלת ב אינה רואה בית ספר אחר');

  -- ═══ 2. מנהלת אינה נוגעת בכסף ובאישורים ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_prin1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teacher_months set official_gross = 99999 where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'מנהלת נחסמה משינוי שכר רשמי');

  begin
    update public.teacher_months set approved = true where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'מנהלת נחסמה מאישור');

  begin
    update public.teacher_months set frontal_hours = 20 where id = t1;
    st := array_append(st, 'PASS');
  exception when others then st := array_append(st, 'FAIL');
  end;
  nm := array_append(nm, 'מנהלת כן משנה שעות פרונטליות');
  reset role;

  -- ═══ 3. חשבת שכר: סימולציה בלבד ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_clerk, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teacher_months set official_gross = 13000 where id = t1;
    st := array_append(st, 'PASS');
  exception when others then st := array_append(st, 'FAIL');
  end;
  nm := array_append(nm, 'חשבת שכר מזינה שכר רשמי');

  begin
    update public.teacher_months set name = 'שם אחר' where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'חשבת שכר נחסמה משינוי שם');
  reset role;

  -- ═══ 4. רינה: אישור רשתי בלבד, ורק אחרי השליח ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_net, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teacher_months set net_approved = true where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'רינה נחסמה מאישור לפני השליח');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_coord, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.teacher_months set approved = true where id = t1;
  reset role;

  select count(*) into n from public.teacher_months
   where id = t1 and approved_by = u_coord and approved_at is not null;
  st := array_append(st, (case when n = 1 then 'PASS' else 'FAIL' end));
  nm := array_append(nm, 'חתימת המאשר נקבעת בשרת');

  perform set_config('request.jwt.claims', json_build_object('sub', u_net, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teacher_months set net_approved = true where id = t1;
    st := array_append(st, 'PASS');
  exception when others then st := array_append(st, 'FAIL');
  end;
  nm := array_append(nm, 'רינה מאשרת אחרי השליח');

  begin
    update public.teacher_months set official_gross = 1 where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'רינה נחסמה משינוי שכר');
  reset role;

  -- ═══ 5. חודש נעול ═══
  update public.months set locked = true where key = '2099-01';
  perform set_config('request.jwt.claims', json_build_object('sub', u_prin1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teacher_months set frontal_hours = 10 where id = t1;
    st := array_append(st, 'FAIL');
  exception when others then st := array_append(st, 'PASS');
  end;
  nm := array_append(nm, 'חודש נעול חוסם עריכה');
  reset role;
  update public.months set locked = false where key = '2099-01';

  -- ═══ 6. יומן אירועים ═══
  select count(*) into n from public.audit_log where row_id = t1;
  st := array_append(st, (case when n >= 3 then 'PASS' else 'FAIL' end));
  nm := array_append(nm, 'יומן האירועים תיעד ' || n || ' פעולות');

  -- ═══ ניקוי ═══
  delete from public.teacher_months where id = t1;
  delete from public.months  where key = '2099-01';
  delete from public.profiles where id in (u_coord,u_clerk,u_prin1,u_prin2,u_net);
  delete from public.schools where id in (s1,s2);
  delete from auth.users where id in (u_coord,u_clerk,u_prin1,u_prin2,u_net);

  return query select a, b from unnest(st, nm) as x(a, b);
end
$fn$;

select status, check_name from private.rls_test();

drop function private.rls_test();
