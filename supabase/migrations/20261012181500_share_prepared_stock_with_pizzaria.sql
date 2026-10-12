-- Compartilha produtos preparados entre setores sem duplicar o saldo.
-- Ex.: Carne de sol ralada pode ser vista/pedida por Cozinha e Pizzaria,
-- descontando sempre do mesmo estoque preparado.

create table if not exists public.prepared_item_sectors (
  prepared_item_id uuid not null references public.prepared_items(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prepared_item_id, sector_id)
);

alter table public.prepared_item_sectors enable row level security;

drop policy if exists "prepared item sectors visible to staff" on public.prepared_item_sectors;
create policy "prepared item sectors visible to staff" on public.prepared_item_sectors
for select to authenticated
using (
  (select private.current_role()) in ('preparer','admin','separator','inventory')
  or exists (
    select 1
    from public.profiles p
    where p.user_id=(select auth.uid())
      and p.is_active=true
      and p.sector_id=sector_id
  )
);

grant select on public.prepared_item_sectors to authenticated;

-- Cada item preparado já existente continua visível para seu setor original.
insert into public.prepared_item_sectors (prepared_item_id,sector_id,product_id)
select id,destination_sector_id,product_id
from public.prepared_items
on conflict (prepared_item_id,sector_id)
do update set product_id=excluded.product_id;

-- Carne de sol ralada: o mesmo saldo fica disponível também para a Pizzaria.
insert into public.prepared_item_sectors (prepared_item_id,sector_id,product_id)
select pi.id,s.id,p.id
from public.prepared_items pi
join public.sectors s on s.slug='pizzaria'
join public.products p
  on p.sector_id=s.id
 and lower(p.name)=lower('Carne de sol ralada')
where lower(pi.name)=lower('Carne de sol ralada')
on conflict (prepared_item_id,sector_id)
do update set product_id=excluded.product_id;

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
    select
      pi.*,
      string_agg(distinct s.name, ', ' order by s.name) as visible_sectors
    from public.prepared_items pi
    join public.prepared_item_sectors pis on pis.prepared_item_id=pi.id
    join public.sectors s on s.id=pis.sector_id
    cross join me
    where pi.is_active=true
      and (
        me.role in ('preparer','admin','separator','inventory')
        or pis.sector_id=me.sector_id
      )
    group by pi.id
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
      pis.prepared_item_id,
      sum(coalesce(oi.received_base,0))::numeric as qty
    from public.prepared_item_sectors pis
    join public.order_items oi on oi.product_id=pis.product_id
    join public.orders o
      on o.id=oi.order_id
     and o.sector_id=pis.sector_id
     and o.received_at is not null
    group by pis.prepared_item_id
  ),
  returned as (
    select
      pis.prepared_item_id,
      sum(coalesce(ci.return_base,0))::numeric as qty
    from public.prepared_item_sectors pis
    join public.order_items oi on oi.product_id=pis.product_id
    join public.orders o on o.id=oi.order_id and o.sector_id=pis.sector_id
    join public.closeout_items ci on ci.order_item_id=oi.id
    join public.closeouts c on c.id=ci.closeout_id
      and c.status in ('submitted','confirmed')
    group by pis.prepared_item_id
  )
  select
    ai.id,
    ai.destination_sector_id,
    ai.visible_sectors,
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
  left join produced pr on pr.prepared_item_id=ai.id
  left join received rc on rc.prepared_item_id=ai.id
  left join returned rt on rt.prepared_item_id=ai.id
  order by ai.category,ai.name;
$$;

revoke all on function public.get_prepared_stock() from public;
grant execute on function public.get_prepared_stock() to authenticated;
