-- "באר שבע וחיפה — לא לתשלום שכר" (שרה, 22.9.26): בית ספר שהרשת אינה משלמת
-- בו שכר עובדים. מופיע בהכנסות מול הוצאות (צבוע ומסומן), בלי מחזור שכר.
alter table public.schools add column if not exists pays_salary boolean not null default true;
notify pgrst, 'reload schema';
