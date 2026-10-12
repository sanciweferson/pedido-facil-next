-- Adiciona porções padrão de Alcatra (200 g e 400 g) ao pré-preparo.
-- Isso faz lotes já abertos de Alcatra exibirem imediatamente os dois campos.

insert into public.products (sector_id,name,category,unit_type,emoji,is_active)
select s.id,v.name,'Porções','count','🥩',true
from public.sectors s
cross join (values
  ('Porção de alcatra (200 g)'),
  ('Porção de alcatra (400 g)')
) as v(name)
where s.slug='cozinha'
  and not exists (
    select 1 from public.products p
    where p.sector_id=s.id and lower(p.name)=lower(v.name)
  );

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',200,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de alcatra (200 g)'
where lower(i.name)=lower('Alcatra')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',400,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de alcatra (400 g)'
where lower(i.name)=lower('Alcatra')
on conflict do nothing;
