-- שרה, 23.9.2026 — שתי בקשות על טבלת "העברות לסניפים":
--
-- א. "תן לי מקום לעגל סכומים": הפער המחושב יוצא 14,061 ₪ לחודש, ומהסניף
--    מבקשים סכום עגול. השדה הוא הסכום החודשי שסוכם בפועל (שרה: "חודשי,
--    והשנתי נגזר ממנו") — הסכום השנתי בטבלה הוא הוא כפול 12. הפער
--    המחושב נשאר מוצג לצדו כעוגן, ולא נדרס.
--
-- ב. "תן אפשרות לרשום בטבלה כל חודש מה התקבל ממשרד החינוך, מה שולם
--    מבית חב"ד והפער לתשלום הרשת. שיהיה אפשר לסכום חודשים" — מעקב
--    תקבולים ותשלומים בפועל, שורה לכל סניף בכל חודש. הפער אינו נשמר:
--    הוא עלות החודש פחות שני הסכומים, ומחושב בתצוגה, כדי שלא יוכל
--    להיסתר מהם.
--
-- שתיהן מאחורי אותו RLS של דף עלות ההוראה — coordinator בלבד.

alter table public.school_finance
  add column if not exists monthly_transfer numeric
    check (monthly_transfer is null or monthly_transfer >= 0);
comment on column public.school_finance.monthly_transfer is
  'סכום חודשי מעוגל להעברה מהסניף — מה שסוכם בפועל; השנתי בטבלה = כפול 12';

create table if not exists public.school_payment_ledger (
  school_id         uuid not null references public.schools(id) on delete cascade,
  month_key         text not null references public.months(key) on delete cascade,
  ministry_received numeric check (ministry_received is null or ministry_received >= 0),
  chabad_paid       numeric check (chabad_paid       is null or chabad_paid       >= 0),
  note              text,
  updated_at        timestamptz not null default now(),
  primary key (school_id, month_key)
);
comment on table public.school_payment_ledger is
  'תקבולים ותשלומים בפועל לכל סניף בכל חודש — משרד החינוך ובית חב"ד. הפער לתשלום הרשת מחושב ואינו נשמר.';

alter table public.school_payment_ledger enable row level security;
grant select, insert, update, delete on public.school_payment_ledger to authenticated;

drop policy if exists ledger_coordinator_only on public.school_payment_ledger;
create policy ledger_coordinator_only on public.school_payment_ledger
  for all
  using (private.my_role() = 'coordinator')
  with check (private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
