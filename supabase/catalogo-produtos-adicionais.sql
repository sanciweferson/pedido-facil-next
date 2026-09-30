-- Catálogo adicional do Pedido Fácil.
-- Pode ser executado novamente: produtos existentes não serão duplicados.
-- As porções com peso fixo são cadastradas como unidade (un), para o usuário
-- informar quantas porções pegou; o peso aparece no nome do produto.

insert into public.products (sector_id, name, category, unit_type, emoji)
select s.id, p.name, p.category, p.unit_type, p.emoji
from (values
  -- Pizzaria: verduras e legumes
  ('pizzaria','Manjericão','Verduras e legumes','weight','🌿'),
  ('pizzaria','Cebola branca','Verduras e legumes','weight','🧅'),
  ('pizzaria','Tomate salada','Verduras e legumes','weight','🍅'),
  ('pizzaria','Tomate cajá','Verduras e legumes','weight','🍅'),
  ('pizzaria','Tomate cereja','Verduras e legumes','weight','🍅'),
  -- Pizzaria: defumados e frios
  ('pizzaria','Pepperoni','Defumados','weight','🥓'),
  ('pizzaria','Lombinho','Defumados','weight','🥓'),
  ('pizzaria','Calabresa','Defumados','weight','🌭'),
  ('pizzaria','Peito de peru','Defumados e frios','weight','🍖'),
  -- Pizzaria: queijos
  ('pizzaria','Queijo gorgonzola (tipo Roquefort)','Queijos','weight','🧀'),
  ('pizzaria','Queijo coalho','Queijos','weight','🧀'),
  ('pizzaria','Queijo provolone','Queijos','weight','🧀'),
  ('pizzaria','Requeijão','Queijos','weight','🧀'),
  -- Pizzaria: proteínas e preparos
  ('pizzaria','Carne de sol ralada','Proteínas','weight','🥩'),
  ('pizzaria','Frango desfiado','Proteínas','weight','🍗'),
  ('pizzaria','Frango para cozinhar','Proteínas','weight','🍗'),
  -- Pizzaria: complementos e embalagens
  ('pizzaria','Ovos','Ovos e laticínios','count','🥚'),
  ('pizzaria','Creme de leite','Ovos e laticínios','count','🥛'),
  ('pizzaria','Manteiga da terra','Ovos e laticínios','weight','🧈'),
  ('pizzaria','Embalagem de pizza mini','Embalagens','count','📦'),
  ('pizzaria','Embalagem de pizza média','Embalagens','count','📦'),
  ('pizzaria','Embalagem de pizza grande','Embalagens','count','📦'),
  ('pizzaria','Saco de lixo preto','Descartáveis','count','🗑️'),

  -- Cozinha: porções prontas, contadas por unidade
  ('cozinha','Porção de carne de sol (200 g)','Porções','count','🥩'),
  ('cozinha','Porção de carne de sol (400 g)','Porções','count','🥩'),
  ('cozinha','Porção de filé de peito de frango (200 g)','Porções','count','🍗'),
  ('cozinha','Porção de filé de peito de frango (400 g)','Porções','count','🍗'),
  -- Cozinha: insumos
  ('cozinha','Sal','Temperos e insumos','weight','🧂'),
  ('cozinha','Óleo','Temperos e insumos','volume','🫗'),
  ('cozinha','Manteiga da terra','Ovos e laticínios','weight','🧈'),
  ('cozinha','Creme de leite','Ovos e laticínios','count','🥛'),
  ('cozinha','Ovos','Ovos e laticínios','count','🥚'),
  ('cozinha','Saco de lixo preto','Descartáveis','count','🗑️'),

  -- Bar: cervejas
  ('bar','Heineken','Cervejas','count','🍺'),
  ('bar','Skol','Cervejas','count','🍺'),
  ('bar','Devassa','Cervejas','count','🍺'),
  -- Bar: refrigerantes
  ('bar','Coca-Cola lata','Refrigerantes','count','🥤'),
  ('bar','Coca-Cola lata zero','Refrigerantes','count','🥤'),
  ('bar','Coca-Cola 2 litros','Refrigerantes','count','🥤'),
  ('bar','Coca-Cola 2 litros zero','Refrigerantes','count','🥤'),
  ('bar','Coca-Cola 1 litro','Refrigerantes','count','🥤'),
  ('bar','Coca-Cola 1 litro zero','Refrigerantes','count','🥤'),
  ('bar','Guaraná 2 litros','Refrigerantes','count','🥤'),
  ('bar','Guaraná 1 litro','Refrigerantes','count','🥤'),
  ('bar','Saco de lixo preto','Descartáveis','count','🗑️')
) as p(sector_slug, name, category, unit_type, emoji)
join public.sectors s on s.slug = p.sector_slug
on conflict (sector_id, name) do nothing;

-- Preserva possíveis pedidos antigos, mas tira o item duplicado da lista ativa.
update public.products
set is_active = false
where sector_id = (select id from public.sectors where slug = 'pizzaria')
  and name = 'Frango cozido desfiado';
