-- Perfil de pré-preparo (Araújo) e registro de lotes de produção.
-- O fluxo é independente dos pedidos: o responsável retira o insumo bruto,
-- prepara/porciona e registra os rendimentos e as aparas.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('pending','requester','separator','inventory','preparer','admin'));

create table if not exists public.prep_inputs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'Proteínas',
  emoji text not null default '🥩',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_batches (
  id uuid primary key default gen_random_uuid(),
  input_id uuid not null references public.prep_inputs(id),
  created_by uuid not null references public.profiles(user_id),
  input_amount numeric(12,3) not null check (input_amount > 0),
  input_unit text not null default 'kg' check (input_unit in ('g','kg')),
  input_base numeric(14,3) not null check (input_base > 0),
  scraps_amount numeric(12,3) not null default 0 check (scraps_amount >= 0),
  scraps_unit text not null default 'kg' check (scraps_unit in ('g','kg')),
  scraps_base numeric(14,3) not null default 0 check (scraps_base >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.prep_batches(id) on delete cascade,
  portion_grams numeric(12,3) not null check (portion_grams > 0),
  quantity integer not null check (quantity > 0),
  destination_id uuid references public.prep_destinations(id),
  created_at timestamptz not null default now()
);

alter table public.prep_inputs enable row level security;
alter table public.prep_destinations enable row level security;
alter table public.prep_batches enable row level security;
alter table public.prep_outputs enable row level security;

drop policy if exists "prep staff read inputs" on public.prep_inputs;
create policy "prep staff read inputs" on public.prep_inputs
for select to authenticated
using ((select private.current_role()) in ('preparer','admin'));

drop policy if exists "prep staff read destinations" on public.prep_destinations;
create policy "prep staff read destinations" on public.prep_destinations
for select to authenticated
using ((select private.current_role()) in ('preparer','admin'));

drop policy if exists "prep staff read batches" on public.prep_batches;
create policy "prep staff read batches" on public.prep_batches
for select to authenticated
using ((select private.current_role()) in ('preparer','admin'));

drop policy if exists "prep staff create batches" on public.prep_batches;
create policy "prep staff create batches" on public.prep_batches
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.current_role()) in ('preparer','admin')
);

drop policy if exists "prep staff update own batches" on public.prep_batches;
create policy "prep staff update own batches" on public.prep_batches
for update to authenticated
using (
  (select private.current_role()) = 'admin'
  or (created_by = (select auth.uid()) and (select private.current_role()) = 'preparer')
)
with check (
  (select private.current_role()) = 'admin'
  or (created_by = (select auth.uid()) and (select private.current_role()) = 'preparer')
);

drop policy if exists "prep staff read outputs" on public.prep_outputs;
create policy "prep staff read outputs" on public.prep_outputs
for select to authenticated
using (
  exists (
    select 1 from public.prep_batches b
    where b.id = batch_id
      and ((select private.current_role()) = 'admin'
        or (b.created_by = (select auth.uid()) and (select private.current_role()) = 'preparer'))
  )
);

drop policy if exists "prep staff create outputs" on public.prep_outputs;
create policy "prep staff create outputs" on public.prep_outputs
for insert to authenticated
with check (
  exists (
    select 1 from public.prep_batches b
    where b.id = batch_id
      and b.status = 'in_progress'
      and ((select private.current_role()) = 'admin'
        or (b.created_by = (select auth.uid()) and (select private.current_role()) = 'preparer'))
  )
);

drop policy if exists "prep staff delete outputs" on public.prep_outputs;
create policy "prep staff delete outputs" on public.prep_outputs
for delete to authenticated
using (
  exists (
    select 1 from public.prep_batches b
    where b.id = batch_id
      and b.status = 'in_progress'
      and ((select private.current_role()) = 'admin'
        or (b.created_by = (select auth.uid()) and (select private.current_role()) = 'preparer'))
  )
);

grant select on public.prep_inputs, public.prep_destinations, public.prep_batches, public.prep_outputs to authenticated;
grant insert on public.prep_batches, public.prep_outputs to authenticated;
grant update on public.prep_batches to authenticated;
grant delete on public.prep_outputs to authenticated;

insert into public.prep_destinations (name) values
  ('Cozinhar'),
  ('Churrasqueira')
on conflict (name) do nothing;

insert into public.prep_inputs (name, category, emoji) values
  ('Filé de peito de frango','Frangos','🍗'),
  ('Coxa e sobrecoxa','Frangos','🍗'),
  ('Carne de sol','Carnes','🥩'),
  ('Alcatra','Carnes','🥩'),
  ('Tilápia','Peixes','🐟')
on conflict (name) do nothing;
