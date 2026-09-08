-- "יש היעדרויות וצריך סיבה ולצרף טופס מחלה. חופשת לידה. ומילוי מקום
-- יומי או לתקופה" (שרה, 6.9.2026).
--
-- ארבע עמודות: סיבת ההיעדרות (sick/maternity/unpaid/other), נתיב טופס
-- המחלה ב-Storage, ותקופת מילוי המקום (יום אחד = mm_from=mm_to).
alter table public.teacher_months
  add column if not exists absence_reason text
    check (absence_reason is null or absence_reason in ('sick','child_sick','miluim','maternity','unpaid','other')),
  add column if not exists sick_form_path text,
  add column if not exists mm_from date,
  add column if not exists mm_to date;

comment on column public.teacher_months.absence_reason is
  'סיבת ההיעדרות שדיווחה המנהלת: sick=מחלה, child_sick=מחלת ילד, miluim=מילואים, maternity=חופשת לידה, unpaid=חל"ת, other=אחר';
comment on column public.teacher_months.sick_form_path is
  'נתיב טופס המחלה בדלי sick-forms — הועלה מהקישור של המנהלת';
comment on column public.teacher_months.mm_from is 'תחילת מילוי המקום (יומי: שווה ל-mm_to)';
comment on column public.teacher_months.mm_to   is 'סיום מילוי המקום';

-- דלי טופסי המחלה. ההעלאה נעשית מצד השרת (api/link-upload) עם מפתח
-- השרת; הקריאה — לשרה ולחשבת בלבד.
insert into storage.buckets (id, name, public)
values ('sick-forms', 'sick-forms', false)
on conflict (id) do nothing;

-- to authenticated — חובה: מדיניות בלי הגבלת רול מוערכת גם על anon,
-- ול-anon אין EXECUTE על private.my_role(). בלי זה כל העלאת חתימה של
-- מורה מהקישור קרסה עם "permission denied for function my_role" (6.9).
drop policy if exists "sick forms readable by office" on storage.objects;
create policy "sick forms readable by office" on storage.objects
  for select to authenticated
  using (bucket_id = 'sick-forms' and private.my_role() in ('coordinator','clerk'));
