-- הדיווח על חודש העבודה מגיע בחודש שאחריו.
--
-- "החודש מקבלים על אוגוסט" (שרה, 1.9): חודש עבודה נסגר, ובחודש שאחריו
-- מדווחים עליו, מאשרים ומשלמים. המועדים נקבעו בטעות על אותו חודש —
-- כלומר הדיווח על ספטמבר היה נדרש ב-5 בספטמבר, באמצע החודש שעליו
-- מדווחים. מנהלת לא יכולה לדווח על היעדרויות שטרם קרו.
--
-- מתוקן: ה-5 וה-6 הם של החודש שאחרי חודש העבודה. ספטמבר → 05/10.

update public.months
   set report_due = (to_date(key || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '4 days')::date,
       submit_due = (to_date(key || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '5 days')::date
 where key ~ '^\d{4}-\d{2}$';

comment on column public.months.report_due is
  'המועד האחרון לדיווח המנהלות על חודש העבודה — ה-5 בחודש שאחריו';
comment on column public.months.submit_due is
  'המועד האחרון להשלמת פרטי המורה — ה-6 בחודש שאחרי חודש העבודה';

notify pgrst, 'reload schema';
