-- Estoque interno dos produtos preparados + integração com pedidos/retornos.
-- Mantém o histórico de lotes e calcula o saldo em tempo real:
-- produzido - recebido pela cozinha + devolvido pela cozinha.

alter table public.prep_destinations
  add column if not exists sector_id uuid references public.sectors(id);

update public.prep_destinations d
set sector_id = s.id
from public.sectors s
where d.name in ('Cozinhar','Cozinha')
  and s.slug = 'cozinha'
  and d.sector_id is null;

create table if not exists public.prepared_items (
  id uuid primary key default gen_random_uuid(),
  source_input_id uuid references public.prep_inputs(id),
  destination_sector_id uuid not null references public.sectors(id),
  product_id uuid references public.products(id),
  name text not null,
  category text not null default 'Porções',
  emoji text not null default '🥩',
  stock_type text not null check (stock_type in ('count','weight')),
  portion_grams numeric(12,3),
  default_unit text not null default 'un',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (stock_type = 'count' and default_unit = 'un')
    or (stock_type = 'weight' and default_unit in ('g','kg'))
  )
);

create unique index if not exists prepared_items_unique_output
on public.prepared_items (
  destination_sector_id,
  name,
  coalesce(portion_grams, 0)
);

alter table public.prep_outputs
  alter column portion_grams drop not null,
  alter column quantity drop not null;

alter table public.prep_outputs
  add column if not exists prepared_item_id uuid references public.prepared_items(id),
  add column if not exists amount numeric(12,3),
  add column if not exists amount_unit text,
  add column if not exists amount_base numeric(14,3);

-- Produtos que a Cozinha pode pedir e consumir no fluxo normal.
insert into public.products (sector_id,name,category,unit_type,emoji,is_active)
select s.id,'Carne de sol ralada','Proteínas','weight','🥩',true
from public.sectors s
where s.slug='cozinha'
  and not exists (
    select 1 from public.products p
    where p.sector_id=s.id and lower(p.name)=lower('Carne de sol ralada')
  );

insert into public.products (sector_id,name,category,unit_type,emoji,is_active)
select s.id,'Casquinha de caranguejo','Porções','count','🦀',true
from public.sectors s
where s.slug='cozinha'
  and not exists (
    select 1 from public.products p
    where p.sector_id=s.id and lower(p.name)=lower('Casquinha de caranguejo')
  );

insert into public.products (sector_id,name,category,unit_type,emoji,is_active)
select s.id,v.name,'Porções','count','🥩',true
from public.sectors s
cross join (values
  ('Porção de filé mignon (200 g)'),
  ('Porção de filé mignon (400 g)')
) as v(name)
where s.slug='cozinha'
  and not exists (
    select 1 from public.products p
    where p.sector_id=s.id and lower(p.name)=lower(v.name)
  );

insert into public.prep_inputs (name,category,emoji)
select 'Filé mignon','Carnes','🥩'
where not exists (select 1 from public.prep_inputs where lower(name)=lower('Filé mignon'));

insert into public.prep_inputs (name,category,emoji)
select 'Caranguejo','Frutos do mar','🦀'
where not exists (select 1 from public.prep_inputs where lower(name)=lower('Caranguejo'));

-- Catálogo dos resultados de pré-preparo destinados à Cozinha.
insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',200,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de filé de peito de frango (200 g)'
where lower(i.name)=lower('Filé de peito de frango')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',400,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de filé de peito de frango (400 g)'
where lower(i.name)=lower('Filé de peito de frango')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',200,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de carne de sol (200 g)'
where lower(i.name)=lower('Carne de sol')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',400,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de carne de sol (400 g)'
where lower(i.name)=lower('Carne de sol')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',200,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de filé mignon (200 g)'
where lower(i.name)=lower('Filé mignon')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',400,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Porção de filé mignon (400 g)'
where lower(i.name)=lower('Filé mignon')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Preparados',p.emoji,'weight',null,'kg'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Carne de sol ralada'
where lower(i.name)=lower('Carne de sol')
on conflict do nothing;

insert into public.prepared_items
(source_input_id,destination_sector_id,product_id,name,category,emoji,stock_type,portion_grams,default_unit)
select i.id,s.id,p.id,p.name,'Porções',p.emoji,'count',null,'un'
from public.prep_inputs i
join public.sectors s on s.slug='cozinha'
join public.products p on p.sector_id=s.id and p.name='Casquinha de caranguejo'
where lower(i.name)=lower('Caranguejo')
on conflict do nothing;

-- Liga registros antigos de 200/400 g ao novo catálogo.
update public.prep_outputs po
set prepared_item_id = pi.id
from public.prep_batches b
join public.prep_inputs i on i.id=b.input_id
join public.prepared_items pi on pi.source_input_id=i.id
where po.batch_id=b.id
  and po.prepared_item_id is null
  and pi.stock_type='count'
  and pi.portion_grams=po.portion_grams
  and (
    po.destination_id is null
    or exists (
      select 1 from public.prep_destinations d
      where d.id=po.destination_id
        and (d.sector_id=pi.destination_sector_id or d.sector_id is null)
    )
  );

alter table public.prepared_items enable row level security;

drop policy if exists "prepared items visible to staff" on public.prepared_items;
create policy "prepared items visible to staff" on public.prepared_items
for select to authenticated
using (
  (select private.current_role()) in ('preparer','admin','separator','inventory')
  or exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.is_active=true
      and p.sector_id=destination_sector_id
  )
);

grant select on public.prepared_items to authenticated;
grant select, insert, update, delete on public.prep_outputs to authenticated;

-- Preparer/admin podem usar o catálogo novo ao registrar saídas.
drop policy if exists "prep staff update outputs" on public.prep_outputs;
create policy "prep staff update outputs" on public.prep_outputs
for update to authenticated
using (
  exists (
    select 1 from public.prep_batches b
    where b.id=batch_id
      and b.status='in_progress'
      and ((select private.current_role())='admin'
        or (b.created_by=(select auth.uid()) and (select private.current_role())='preparer'))
  )
)
with check (
  exists (
    select 1 from public.prep_batches b
    where b.id=batch_id
      and b.status='in_progress'
      and ((select private.current_role())='admin'
        or (b.created_by=(select auth.uid()) and (select private.current_role())='preparer'))
  )
);

create or replace function public.get_prepared_stock()
returns table (
  item_id uuid,
  destination_sector_id uuid,
  destination_name text,
  product_id uuid,
  item_name text,
  category text,
  emoji text,
  stock_type text,
  portion_grams numeric,
  default_unit text,
  produced_base numeric,
  consumed_base numeric,
  returned_base numeric,
  balance_base numeric
)
language sql
stable
security definer
set search_path=''
as $$
  with me as (
    select p.role,p.sector_id
    from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active=true
    limit 1
  ),
  allowed_items as (
    select pi.*
    from public.prepared_items pi, me
    where pi.is_active=true
      and (
        me.role in ('preparer','admin','separator','inventory')
        or me.sector_id=pi.destination_sector_id
      )
  ),
  produced as (
    select
      po.prepared_item_id,
      sum(
        case
          when pi.stock_type='count' then coalesce(po.quantity,0)
          else coalesce(po.amount_base,0)
        end
      )::numeric as qty
    from public.prep_outputs po
    join public.prep_batches b on b.id=po.batch_id and b.status='completed'
    join public.prepared_items pi on pi.id=po.prepared_item_id
    group by po.prepared_item_id
  ),
  received as (
    select
      pi.id as prepared_item_id,
      sum(coalesce(oi.received_base,0))::numeric as qty
    from public.prepared_items pi
    join public.order_items oi on oi.product_id=pi.product_id
    join public.orders o on o.id=oi.order_id
      and o.sector_id=pi.destination_sector_id
      and o.received_at is not null
    group by pi.id
  ),
  returned as (
    select
      pi.id as prepared_item_id,
      sum(coalesce(ci.return_base,0))::numeric as qty
    from public.prepared_items pi
    join public.order_items oi on oi.product_id=pi.product_id
    join public.orders o on o.id=oi.order_id and o.sector_id=pi.destination_sector_id
    join public.closeout_items ci on ci.order_item_id=oi.id
    join public.closeouts c on c.id=ci.closeout_id
      and c.status in ('submitted','confirmed')
    group by pi.id
  )
  select
    ai.id,
    ai.destination_sector_id,
    s.name,
    ai.product_id,
    ai.name,
    ai.category,
    ai.emoji,
    ai.stock_type,
    ai.portion_grams,
    ai.default_unit,
    coalesce(pr.qty,0),
    greatest(coalesce(rc.qty,0)-coalesce(rt.qty,0),0),
    coalesce(rt.qty,0),
    coalesce(pr.qty,0)-greatest(coalesce(rc.qty,0)-coalesce(rt.qty,0),0)
  from allowed_items ai
  join public.sectors s on s.id=ai.destination_sector_id
  left join produced pr on pr.prepared_item_id=ai.id
  left join received rc on rc.prepared_item_id=ai.id
  left join returned rt on rt.prepared_item_id=ai.id
  order by s.name,ai.category,ai.name;
$$;

revoke all on function public.get_prepared_stock() from public;
grant execute on function public.get_prepared_stock() to authenticated;
