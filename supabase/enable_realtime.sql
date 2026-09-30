-- Execute uma vez no SQL Editor do projeto Supabase.
-- O script apenas adiciona as tabelas do Pedido Fácil à publicação existente.
-- Ele não recria a publicação e pode ser executado novamente sem duplicar tabelas.
do $$
declare
  table_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não existe. Ative Realtime para o projeto no painel do Supabase e execute este script novamente.';
  end if;

  foreach table_name in array array['orders', 'order_items', 'closeouts', 'closeout_items']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Conferência opcional:
-- select schemaname, tablename
-- from pg_publication_tables
-- where pubname = 'supabase_realtime'
-- order by tablename;
