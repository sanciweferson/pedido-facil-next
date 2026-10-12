-- Usa uma chave única compatível com upsert do PostgREST.
drop index if exists public.prep_outputs_batch_item_unique;

create unique index if not exists prep_outputs_batch_item_unique
on public.prep_outputs(batch_id,prepared_item_id);
