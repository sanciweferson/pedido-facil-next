-- Pedido Fácil: setores, pedidos, separação, recebimento e fechamento.
-- Pesos são guardados também na unidade-base grama; volumes, em ml.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'pending' check (role in ('pending','requester','separator','inventory','admin')),
  sector_id uuid references public.sectors(id),
  requested_sector_id text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors(id),
  name text not null,
  category text not null default 'Geral',
  unit_type text not null check (unit_type in ('weight','volume','count')),
  emoji text not null default '📦',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (sector_id, name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  sector_id uuid not null references public.sectors(id),
  requester_id uuid not null references public.profiles(user_id),
  requester_name text not null,
  status text not null default 'requested' check (status in ('requested','separated','received','return_submitted','closed')),
  separated_by uuid references public.profiles(user_id),
  separated_at timestamptz,
  received_by uuid references public.profiles(user_id),
  received_at timestamptz,
  inventory_logged_by uuid references public.profiles(user_id),
  inventory_logged_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  emoji text not null default '📦',
  unit_type text not null check (unit_type in ('weight','volume','count')),
  requested_amount numeric(12,3) not null check (requested_amount > 0),
  requested_unit text not null check (requested_unit in ('g','kg','ml','L','un')),
  check ((unit_type = 'weight' and requested_unit in ('g','kg')) or (unit_type = 'volume' and requested_unit in ('ml','L')) or (unit_type = 'count' and requested_unit = 'un')),
  requested_base numeric(14,3) not null check (requested_base > 0),
  separated_amount numeric(12,3),
  separated_unit text,
  separated_base numeric(14,3),
  received_amount numeric(12,3),
  received_unit text,
  received_base numeric(14,3),
  created_at timestamptz not null default now()
);

create table public.closeouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  sector_id uuid not null references public.sectors(id),
  submitted_by uuid not null references public.profiles(user_id),
  status text not null default 'submitted' check (status in ('submitted','confirmed')),
  confirmed_by uuid references public.profiles(user_id),
  confirmed_at timestamptz,
  inventory_logged_by uuid references public.profiles(user_id),
  inventory_logged_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.closeout_items (
  id uuid primary key default gen_random_uuid(),
  closeout_id uuid not null references public.closeouts(id) on delete cascade,
  order_item_id uuid references public.order_items(id),
  product_name text not null,
  emoji text not null default '📦',
  return_amount numeric(12,3) not null default 0 check (return_amount >= 0),
  return_unit text not null check (return_unit in ('g','kg','ml','L','un')),
  return_base numeric(14,3) not null default 0 check (return_base >= 0),
  damage_amount numeric(12,3) not null default 0 check (damage_amount >= 0),
  damage_unit text not null check (damage_unit in ('g','kg','ml','L','un')),
  damage_base numeric(14,3) not null default 0 check (damage_base >= 0)
);

-- O perfil nasce pendente; os metadados do cadastro não definem permissões.
create function public.handle_new_pedido_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, role, is_active, requested_sector_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Novo usuário'),
    'pending',
    false,
    new.raw_user_meta_data ->> 'requested_sector_id'
  );
  return new;
end;
$$;
revoke all on function public.handle_new_pedido_user() from public;

create trigger on_pedido_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_pedido_user();

create function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.is_active = true
  limit 1;
$$;

create function private.can_access_sector(target_sector uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and (p.role in ('admin','separator','inventory') or p.sector_id = target_sector)
  );
$$;

create function private.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text := private.current_role();
begin
  if actor_role = 'admin' then return new; end if;

  if actor_role = 'separator'
     and old.status = 'requested' and new.status = 'separated'
     and new.separated_by = (select auth.uid())
     and new.separated_at is not null
     and (to_jsonb(new) - array['status','separated_by','separated_at']) = (to_jsonb(old) - array['status','separated_by','separated_at']) then
    return new;
  end if;

  if actor_role = 'requester' and old.requester_id = (select auth.uid()) then
    if old.status = 'separated' and new.status = 'received'
       and new.received_by = (select auth.uid())
       and new.received_at is not null
       and (to_jsonb(new) - array['status','received_by','received_at']) = (to_jsonb(old) - array['status','received_by','received_at']) then
      return new;
    end if;
    if old.status = 'received' and new.status = 'return_submitted'
       and (to_jsonb(new) - array['status']) = (to_jsonb(old) - array['status']) then
      return new;
    end if;
  end if;

  if actor_role = 'inventory' then
    if old.status = new.status
       and new.inventory_logged_by = (select auth.uid())
       and new.inventory_logged_at is not null
       and (to_jsonb(new) - array['inventory_logged_by','inventory_logged_at']) = (to_jsonb(old) - array['inventory_logged_by','inventory_logged_at']) then
      return new;
    end if;
    if old.status = 'return_submitted' and new.status = 'closed'
       and (to_jsonb(new) - array['status']) = (to_jsonb(old) - array['status']) then
      return new;
    end if;
  end if;

  raise exception 'Ação não permitida para esta etapa do pedido';
end;
$$;

create function private.guard_order_item_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := private.current_role();
  parent_order public.orders%rowtype;
begin
  select * into parent_order from public.orders where id = old.order_id;
  if actor_role = 'admin' then return new; end if;

  if actor_role = 'separator' and parent_order.status = 'requested'
     and (to_jsonb(new) - array['separated_amount','separated_unit','separated_base']) = (to_jsonb(old) - array['separated_amount','separated_unit','separated_base']) then
    return new;
  end if;
  if actor_role = 'requester' and parent_order.requester_id = (select auth.uid()) and parent_order.status = 'separated'
     and (to_jsonb(new) - array['received_amount','received_unit','received_base']) = (to_jsonb(old) - array['received_amount','received_unit','received_base']) then
    return new;
  end if;
  raise exception 'Ação não permitida para este item';
end;
$$;

revoke all on function private.guard_order_update() from public;
revoke all on function private.guard_order_item_update() from public;

create trigger guard_order_update
before update on public.orders
for each row execute function private.guard_order_update();

create trigger guard_order_item_update
before update on public.order_items
for each row execute function private.guard_order_item_update();

revoke all on function private.current_role() from public;
revoke all on function private.can_access_sector(uuid) from public;
grant execute on function private.current_role() to authenticated;
grant execute on function private.can_access_sector(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.sectors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.closeouts enable row level security;
alter table public.closeout_items enable row level security;

create policy "profile owner or admin can read profile" on public.profiles
for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_role()) = 'admin');

create policy "active members read allowed sectors" on public.sectors
for select to authenticated
using ((select private.can_access_sector(id)));

-- A lista de setores não é privada; o cadastro precisa mostrá-la antes do login.
create policy "anyone can read sector choices" on public.sectors
for select to anon
using (true);

create policy "active members read allowed products" on public.products
for select to authenticated
using (is_active and (select private.can_access_sector(sector_id)));

create policy "members read allowed orders" on public.orders
for select to authenticated
using ((select private.can_access_sector(sector_id)));

create policy "requesters create their own sector orders" on public.orders
for insert to authenticated
with check (
  (select private.can_access_sector(sector_id))
  and requester_id = (select auth.uid())
  and requester_name = (select p.full_name from public.profiles p where p.user_id = (select auth.uid()))
  and ((select private.current_role()) in ('requester','admin'))
);

create policy "assigned staff update allowed orders" on public.orders
for update to authenticated
using (
  (select private.can_access_sector(sector_id))
  and (
    (select private.current_role()) in ('separator','inventory','admin')
    or (requester_id = (select auth.uid()) and (select private.current_role()) = 'requester')
  )
)
with check (
  (select private.can_access_sector(sector_id))
  and (
    (select private.current_role()) in ('separator','inventory','admin')
    or (requester_id = (select auth.uid()) and (select private.current_role()) = 'requester')
  )
);

create policy "requester can remove own draft order" on public.orders
for delete to authenticated
using (requester_id = (select auth.uid()) and status = 'requested');

create policy "members read items in allowed orders" on public.order_items
for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_access_sector(o.sector_id))));

create policy "requester adds items to own draft" on public.order_items
for insert to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id and o.requester_id = (select auth.uid()) and o.status = 'requested'
      and (product_id is null or exists (select 1 from public.products p where p.id = product_id and p.sector_id = o.sector_id))
  )
);

create policy "assigned staff update order item quantities" on public.order_items
for update to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_access_sector(o.sector_id)) and ((select private.current_role()) in ('separator','admin') or (o.requester_id = (select auth.uid()) and (select private.current_role()) = 'requester'))))
with check (exists (select 1 from public.orders o where o.id = order_id and (select private.can_access_sector(o.sector_id)) and ((select private.current_role()) in ('separator','admin') or (o.requester_id = (select auth.uid()) and (select private.current_role()) = 'requester'))));

create policy "requester deletes items from own draft" on public.order_items
for delete to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.requester_id = (select auth.uid()) and o.status = 'requested'));

create policy "members read closeouts in allowed sectors" on public.closeouts
for select to authenticated
using ((select private.can_access_sector(sector_id)));

create policy "requester submits closeout for received order" on public.closeouts
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and (select private.current_role()) in ('requester','admin')
  and exists (select 1 from public.orders o where o.id = closeouts.order_id and o.requester_id = (select auth.uid()) and o.status = 'received' and o.sector_id = closeouts.sector_id)
);

create policy "inventory confirms closeouts" on public.closeouts
for update to authenticated
using ((select private.can_access_sector(sector_id)) and (select private.current_role()) in ('inventory','admin'))
with check ((select private.can_access_sector(sector_id)) and (select private.current_role()) in ('inventory','admin'));

create policy "requester removes own unconfirmed closeout" on public.closeouts
for delete to authenticated
using (submitted_by = (select auth.uid()) and status = 'submitted');

create policy "members read closeout line items" on public.closeout_items
for select to authenticated
using (exists (select 1 from public.closeouts c where c.id = closeout_id and (select private.can_access_sector(c.sector_id))));

create policy "requester adds own closeout line items" on public.closeout_items
for insert to authenticated
with check (exists (select 1 from public.closeouts c where c.id = closeout_id and c.submitted_by = (select auth.uid()) and c.status = 'submitted'));

create policy "inventory updates closeout line items" on public.closeout_items
for update to authenticated
using (exists (select 1 from public.closeouts c where c.id = closeout_id and (select private.current_role()) in ('inventory','admin') and (select private.can_access_sector(c.sector_id))))
with check (exists (select 1 from public.closeouts c where c.id = closeout_id and (select private.current_role()) in ('inventory','admin') and (select private.can_access_sector(c.sector_id))));

grant select on public.profiles, public.sectors, public.products, public.orders, public.order_items, public.closeouts, public.closeout_items to authenticated;
grant select on public.sectors to anon;
grant insert on public.orders, public.order_items, public.closeouts, public.closeout_items to authenticated;
grant update on public.orders, public.order_items, public.closeouts, public.closeout_items to authenticated;
grant delete on public.orders, public.order_items, public.closeouts to authenticated;

insert into public.sectors (name, slug) values
  ('Pizzaria','pizzaria'), ('Cozinha','cozinha'), ('Bar','bar'), ('Salada','salada')
on conflict (slug) do nothing;

insert into public.products (sector_id, name, category, unit_type, emoji)
select s.id, p.name, p.category, p.unit_type, p.emoji
from (values
  ('pizzaria','Açúcar','Mercearia','weight','🍚'),
  ('pizzaria','Queijo mussarela','Queijos','weight','🧀'),
  ('pizzaria','Molho de tomate','Molhos','count','🍅'),
  ('pizzaria','Queijo parmesão','Queijos','weight','🧀'),
  ('pizzaria','Sal','Temperos','weight','🧂'),
  ('cozinha','Arroz','Mercearia','weight','🍚'),
  ('cozinha','Feijão','Mercearia','weight','🫘'),
  ('cozinha','Frango','Proteínas','weight','🍗'),
  ('bar','Água mineral','Bebidas','count','💧'),
  ('bar','Refrigerante lata','Bebidas','count','🥤'),
  ('bar','Gelo','Bebidas','weight','🧊'),
  ('salada','Tomate','Hortifruti','weight','🍅'),
  ('salada','Alface','Hortifruti','count','🥬'),
  ('salada','Cebola','Hortifruti','weight','🧅')
) as p(sector_slug,name,category,unit_type,emoji)
join public.sectors s on s.slug = p.sector_slug
on conflict (sector_id, name) do nothing;
