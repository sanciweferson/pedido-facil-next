# Pedido Fácil

Protótipo mobile-first para pedidos internos, separação, recebimento, devoluções e lançamento de estoque por setor.

## Antes de começar

- Node.js 20.9 ou superior no WSL (`node -v`).
- Um projeto Supabase **separado** do projeto financeiro.
- As credenciais URL e Publishable Key desse projeto novo.

O cadastro solicita nome e setor, mas fica pendente até um administrador atribuir o papel e ativar a conta. O setor pedido no cadastro não concede acesso por si só.

## Preparar o Supabase

1. Crie um projeto Supabase novo para este app.
2. No painel do projeto, abra **SQL Editor** e execute o arquivo `supabase/migrations/20260927032602_pedido_facil_schema.sql`.
3. Em **Authentication → Providers → Email**, deixe a confirmação de e-mail habilitada para uso real. Para um teste local controlado, ela pode ficar desabilitada; evite solicitar muitos e-mails seguidos porque o envio gratuito tem limite.
4. Copie a URL e a Publishable Key do projeto.

## Rodar no WSL

Na pasta `pedido-facil-next`:

```bash
npm install
cp .env.example .env.local
```

Abra `.env.local` e substitua os dois valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave
```

Depois:

```bash
npm run dev
```

Abra `http://localhost:3000` no navegador. Se mudar o `.env.local`, pare e inicie o servidor novamente.

## Liberar os acessos de teste

Crie primeiro sua conta pela tela **Solicitar cadastro**. No SQL Editor do Supabase, dê a ela acesso de administradora usando o e-mail cadastrado:

```sql
update public.profiles p
set role = 'admin', is_active = true, sector_id = null
from auth.users u
where p.user_id = u.id
  and lower(u.email) = lower('SEU_EMAIL');
```

Depois, crie as contas do Douglas e do Janiel na tela de cadastro e libere cada uma:

```sql
-- Sanci: solicitante da Pizzaria
update public.profiles p
set role = 'requester', is_active = true,
    sector_id = (select id from public.sectors where slug = 'pizzaria')
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('EMAIL_DA_SANCI');

-- Douglas: separa pedidos de todos os setores
update public.profiles p
set role = 'separator', is_active = true, sector_id = null
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('EMAIL_DO_DOUGLAS');

-- Janiel: lança saídas e confere os retornos de todos os setores
update public.profiles p
set role = 'inventory', is_active = true, sector_id = null
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('EMAIL_DO_JANIEL');
```

Substitua os textos de e-mail antes de executar cada consulta. Para adicionar outro solicitante, use `role = 'requester'` e escolha o setor em `sector_id`.

O papel `admin` tem acesso amplo a todos os setores e etapas. Use-o apenas para administração. Para o uso diário do Sanci, deixe o perfil como `requester` na Pizzaria; assim ele verá os pedidos do setor e as telas de solicitar, receber e fechar. Douglas fica como `separator`, e Janiel como `inventory`. O papel atribuído no perfil, e não apenas os botões da tela, define as permissões no banco.

## Fluxo do protótipo

1. O solicitante cria um pedido e escolhe uma unidade explícita para cada quantidade (`g`, `kg`, `ml`, `L` ou `un`).
2. Douglas confere e confirma a separação. A quantidade originalmente pedida não é alterada; se houver algum detalhe (produto já existente no setor, falta em estoque, peça fechada etc.), ele pode registrar uma observação.
3. Só depois da separação Janiel pode registrar a saída no controle da empresa. O solicitante confere e confirma o recebimento.
4. O solicitante informa retorno e avarias; a tela de revisão confirma o envio.
5. Janiel confirma o retorno recebido.

Os registros usam horário do banco (`timestamptz`); a interface apresenta as datas no fuso de São Paulo. Quantidades de peso também são normalizadas para gramas (`1 kg = 1000 g`), sem adivinhar a unidade digitada.

## Observações

- Os setores e poucos produtos iniciais são exemplos; o SQL pode ser editado para refletir a lista real.
- O app usa contas individuais. Os papéis e setores são liberados pelo administrador, não escolhidos livremente como permissão no cadastro.
- Este é um protótipo para teste. Antes de substituir o processo oficial, valide o fluxo com a empresa e revise as permissões para a operação real.
- A tela **Acompanhar pedidos** filtra a lista quando você seleciona um setor. A tela **Relatórios** permite escolher um período e setor e usar a impressão do navegador para salvar como PDF.
- Para receber atualizações em tempo real, execute `supabase/enable_realtime.sql` uma vez no SQL Editor do Supabase. O painel mostra o estado da conexão; se ela cair, a tela ainda atualiza ao recuperar foco/conexão e faz uma consulta de segurança a cada 30 segundos enquanto estiver aberta.
- O painel também mostra alertas quando um pedido muda de etapa. Toque em **Ativar alertas** e permita as notificações do navegador para receber avisos do sistema enquanto a página estiver conectada. Isso não envia avisos depois que a página/navegador são fechados; para isso será preciso configurar Web Push no servidor.
- No celular, a navegação principal fica no topo em uma grade de até três colunas, sem rolagem horizontal. Os campos de quantidade mantêm o foco durante a digitação. Depois de permitir as notificações, o botão do sino passa a **Testar alertas** para confirmar que o navegador exibe notificações.
- O relatório separa pedidos pela data de criação e retornos/avarias pela data em que o fechamento foi enviado. As permissões existentes de RLS continuam limitando os dados exibidos para cada perfil.

## Atualizar o catálogo de produtos

Depois de aplicar os arquivos do projeto, abra o **SQL Editor** do Supabase e execute o conteúdo de `supabase/catalogo-produtos-adicionais.sql`. O script adiciona os novos itens por setor e pode ser executado novamente sem duplicar produtos. Ele também desativa o item duplicado “Frango cozido desfiado”, preservando pedidos antigos. As quatro porções com peso fixo ficam cadastradas como `un`, e o peso aparece no nome para que o funcionário informe apenas a quantidade de porções.
# Foto de perfil e tema

Para habilitar o envio de fotos, execute uma vez `supabase/profile-avatars.sql` no SQL Editor do Supabase. O script cria o bucket público de imagens e políticas para que cada conta só possa enviar, substituir e excluir arquivos dentro da própria pasta. Fotos têm limite de 5 MB.

O tema segue a preferência do dispositivo na primeira visita e, depois que o usuário escolhe claro ou escuro no menu do perfil, essa escolha fica salva no navegador.
