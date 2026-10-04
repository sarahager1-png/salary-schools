select jsonb_build_object(
  'columns', (select jsonb_object_agg(c.relname || '.' || a.attname,
                format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
              from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
              left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
              where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'functions', (select jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                  md5(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')))
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'private') and p.prokind = 'f'),
  'function_acl', (select jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                  concat_ws(',',
                    case when has_function_privilege('anon', p.oid, 'execute') then 'anon' end,
                    case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end))
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'private') and p.prokind = 'f'),
  'triggers', (select jsonb_object_agg(c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text)
               from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and not t.tgisinternal),
  'policies', (select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname,
                 md5(cmd || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')))
               from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')),
  'rls', (select jsonb_object_agg(c.relname, c.relrowsecurity)
          from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  'constraints', (select jsonb_object_agg(c.relname || '.' || k.conname, md5(pg_get_constraintdef(k.oid)))
                  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public'),
  'indexes', (select jsonb_object_agg(indexname, md5(indexdef)) from pg_indexes where schemaname = 'public'),
  'buckets', (select jsonb_object_agg(id, public) from storage.buckets),
  'enums', (select jsonb_object_agg(t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
            from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'),
  'views', (select jsonb_object_agg(c.relname, md5(pg_get_viewdef(c.oid)))
            from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm'))
) as fp;
