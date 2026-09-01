-- השליח מכניסה הודעות לתור.
--
-- בקשת הטפסים מהמורות אינה משימה מתוזמנת אלא פעולה של שרה: "אשלח
-- בלחיצה, לא אוטומציה" (1.9). לכן המסך צריך להיות מסוגל להכניס שורות
-- לתור — עד כה רק השרת יכול היה.
--
-- ההרשאה צרה: הכנסה בלבד, לשליח בלבד. השליחה עצמה נשארת של ה-cron,
-- ולכן גם לחיצה שגויה אינה מוציאה דבר לפני שהתור נבדק.
drop policy if exists notifications_insert_coordinator on public.notifications;
create policy notifications_insert_coordinator on public.notifications
  for insert to authenticated
  with check (private.my_role() = 'coordinator');

notify pgrst, 'reload schema';
