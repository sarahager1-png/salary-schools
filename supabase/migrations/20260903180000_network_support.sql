-- השתתפות הרשת בדף עלות ההוראה ("תוסיף השתתפות רשת מרינה", שרה 3.9).
alter table public.school_finance
  add column if not exists network_support numeric
  check (network_support is null or network_support >= 0);
