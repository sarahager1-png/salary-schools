-- חזרה מ-20260915120000_teacher_jobs.
-- 1. להריץ מחדש את הפונקציות הקודמות: link_save_row / link_add_row /
--    enforce_column_permissions מ-20260910150000_link_lock_on_10th.sql,
--    p_hours_of מ-20260910120000_hours_exclude_inclusion.sql,
--    link_rows מ-20260827081021_link_rows_stable_order.sql,
--    col_label מ-20260903180000_scope_is_sarahs.sql.
-- 2. אחר כך שתי השורות כאן. שורות צהרון קיימות נמחקות עם העמודה — לגבות קודם.
delete from public.teacher_months where job <> 'teaching';
alter table public.teacher_months drop column if exists extra_roles, drop column if exists hourly_rate, drop column if exists job;
notify pgrst, 'reload schema';
