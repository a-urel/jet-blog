-- Restore prelude: run between the migrations and a data-only dump.
--
--   supabase db reset --sql-paths restore/before-data.sql --sql-paths <data.sql>
--
-- Some migrations insert rows (for example the `header` and `footer` rows in
-- public.navigation_menus). A data-only dump of `public` contains those rows
-- too, so loading it on top of the migrations fails with a duplicate key.
-- The dump holds every `public` row, so empty the whole schema first instead
-- of listing individual tables: a future migration that seeds rows needs no
-- change here. Never run this file against a database you want to keep.

do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
  into table_list
  from pg_tables
  where schemaname = 'public';

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity';
  end if;
end;
$$;
