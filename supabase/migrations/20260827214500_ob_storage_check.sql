-- מדיניות ה-Storage של הקליטה בדקה קיום קוד מול טבלה שסגורה ל-anon —
-- תת-השאילתה רצה בהרשאות הפונה וראתה אפס שורות, וכל העלאה נדחתה
-- ("אין לך הרשאה"). הבדיקה עוברת לפונקציית security definer.
create or replace function private.ob_code_ok(p_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.teacher_onboarding t
                 where t.code = p_code and not t.revoked);
$$;
revoke all on function private.ob_code_ok(text) from public;
grant execute on function private.ob_code_ok(text) to anon, authenticated;

drop policy if exists ob_files_ins on storage.objects;
drop policy if exists ob_files_sel on storage.objects;
create policy ob_files_ins on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'onboarding' and private.ob_code_ok((storage.foldername(name))[1]));
create policy ob_files_sel on storage.objects for select to anon, authenticated
  using (bucket_id = 'onboarding'
    and ((storage.foldername(name))[1] = 'contract' or private.ob_code_ok((storage.foldername(name))[1])));
-- העלאה חוזרת (upsert) דורשת גם update
create policy ob_files_upd on storage.objects for update to anon, authenticated
  using (bucket_id = 'onboarding' and private.ob_code_ok((storage.foldername(name))[1]))
  with check (bucket_id = 'onboarding' and private.ob_code_ok((storage.foldername(name))[1]));
