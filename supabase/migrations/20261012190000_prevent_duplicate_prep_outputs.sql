-- Evita duplicar a mesma saída quando o usuário salva as porções
-- e logo em seguida conclui o lote.

-- Mantém apenas o registro mais antigo de cada item dentro do mesmo lote,
-- somando quantidades/valores duplicados antes de remover os extras.
with grouped as (
  select
    batch_id,
    prepared_item_id,
    min(id::text)::uuid as keep_id,
    sum(coalesce(quantity,0)) as total_quantity,
    sum(coalesce(amount,0)) as total_amount,
    sum(coalesce(amount_base,0)) as total_amount_base
  from public.prep_outputs
  where prepared_item_id is not null
  group by batch_id,prepared_item_id
  having count(*) > 1
),
updated as (
  update public.prep_outputs po
  set
    quantity = case when po.quantity is null then null else g.total_quantity end,
    amount = case when po.amount is null then null else g.total_amount end,
    amount_base = case when po.amount_base is null then null else g.total_amount_base end
  from grouped g
  where po.id=g.keep_id
  returning po.id
)
delete from public.prep_outputs po
using grouped g
where po.batch_id=g.batch_id
  and po.prepared_item_id=g.prepared_item_id
  and po.id<>g.keep_id;

create unique index if not exists prep_outputs_batch_item_unique
on public.prep_outputs(batch_id,prepared_item_id)
where prepared_item_id is not null;
