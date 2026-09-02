-- פירוט ההכנסות וההוצאות בטבלה התחתונה ("יהיו מפורטים", שרה 3.9).
alter table public.school_finance
  add column if not exists detail jsonb;
