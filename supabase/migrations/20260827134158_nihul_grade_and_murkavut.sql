-- דרגת ניהול ורמת מורכבות.
--
-- שכר מנהלת אינו נגזר מסולם המורים. במחשבון הניהול של המשרד יש שני
-- צירים משלו: דרגת ניהול (א..ד) ורמת מורכבות של בית הספר. שניהם היו
-- מקודדים קשיח ל-1 בקוד, ולכן רחל אורנשטיין — מנהלת, מורכבות 1,
-- מזכרת בתיה — קיבלה אומדן לפי דרגת אופק 5 של מורה, בלי גמול ניהול.
--
-- המורכבות היא תכונה של בית הספר, לא של האדם. דרגת הניהול היא אישית.
alter table public.schools
  add column if not exists murkavut smallint not null default 1
  check (murkavut between 1 and 9);

comment on column public.schools.murkavut is
  'רמת מורכבות בית הספר לצורך מחשבון הניהול. ברירת המחדל 1 — כך בכל בתי הספר של הרשת.';

alter table public.teacher_months
  add column if not exists nihul_grade smallint
  check (nihul_grade is null or nihul_grade between 1 and 4);

comment on column public.teacher_months.nihul_grade is
  'דרגת ניהול א..ד כמספר 1..4. רלוונטי רק לשורת מנהל/ת. null = טרם נקבעה.';

notify pgrst, 'reload schema';
