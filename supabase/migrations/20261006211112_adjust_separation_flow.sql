-- Ajuste aplicado ao projeto remoto em 2026-10-06.
-- Douglas confirma o pedido sem alterar a quantidade solicitada, podendo registrar uma observação.
-- Janiel só pode lançar a saída depois que a separação for confirmada.

alter table public.orders
  add column if not exists separation_note text;

alter table public.orders
  drop constraint if exists orders_separation_note_length_check;

alter table public.orders
  add constraint orders_separation_note_length_check
  check (separation_note is null or char_length(separation_note) <= 500);

create or replace function private.guard_order_update()
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
     and (to_jsonb(new) - array['status','separated_by','separated_at','separation_note']) =
         (to_jsonb(old) - array['status','separated_by','separated_at','separation_note']) then
    return new;
  end if;

  if actor_role = 'requester' and old.requester_id = (select auth.uid()) then
    if old.status = 'separated' and new.status = 'received'
       and new.received_by = (select auth.uid())
       and new.received_at is not null
       and (to_jsonb(new) - array['status','received_by','received_at']) =
           (to_jsonb(old) - array['status','received_by','received_at']) then
      return new;
    end if;
    if old.status = 'received' and new.status = 'return_submitted'
       and (to_jsonb(new) - array['status']) = (to_jsonb(old) - array['status']) then
      return new;
    end if;
  end if;

  if actor_role = 'inventory' then
    if old.status <> 'requested'
       and old.status = new.status
       and old.inventory_logged_at is null
       and new.inventory_logged_by = (select auth.uid())
       and new.inventory_logged_at is not null
       and (to_jsonb(new) - array['inventory_logged_by','inventory_logged_at']) =
           (to_jsonb(old) - array['inventory_logged_by','inventory_logged_at']) then
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

create or replace function private.guard_order_item_update()
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

  if actor_role = 'separator'
     and parent_order.status = 'requested'
     and new.separated_amount = old.requested_amount
     and new.separated_unit = old.requested_unit
     and new.separated_base = old.requested_base
     and (to_jsonb(new) - array['separated_amount','separated_unit','separated_base']) =
         (to_jsonb(old) - array['separated_amount','separated_unit','separated_base']) then
    return new;
  end if;

  if actor_role = 'requester'
     and parent_order.requester_id = (select auth.uid())
     and parent_order.status = 'separated'
     and (to_jsonb(new) - array['received_amount','received_unit','received_base']) =
         (to_jsonb(old) - array['received_amount','received_unit','received_base']) then
    return new;
  end if;

  raise exception 'Ação não permitida para este item';
end;
$$;
