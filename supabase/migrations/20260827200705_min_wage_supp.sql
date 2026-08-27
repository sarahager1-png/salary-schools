-- רכיב "ת.שכר מינימום" בתלוש העולם הישן.
--
-- שרה: "בכל תלוש עולם ישן יש תוספת שכר מינימום שהוא גם תוספת בית
-- חב"ד" — לא פנסיוני ולא נושא קרן השתלמות. עד עכשיו כל הברוטו של
-- עולם ישן חושב כבסיס פנסיוני מלא, והאומדן הפריז בכ-2,600 ₪ בחודש
-- על אשקלון לבד.
alter table public.teacher_months
  add column if not exists min_wage_supp numeric;

comment on column public.teacher_months.min_wage_supp is
  'רכיב ת.שכר מינימום מתוך ברוטו העולם הישן. מטופל כתוספת בית חב"ד: מס שכר וביטוח לאומי בלבד.';

notify pgrst, 'reload schema';
