# Gatucho Autopilot — implantação segura

Este pacote substitui o antigo admin local por um painel privado persistente, baseado em Supabase, e adiciona automação de aquisição/conteúdo/medição/venda com checkout Hotmart.

## O que já está implementado

- `admin.html`: painel privado no design system do Gatucho.
- Supabase Auth: login real, sem senha ou hash no GitHub.
- RLS: todas as tabelas expostas têm Row Level Security.
- Catálogo persistente: alterações feitas no admin aparecem no site público.
- Produto piloto: **Pais Conectados, Filhos Saudáveis** já vem cadastrado.
- Hotmart: sincronização do link direto da oferta e recebimento de Webhook V2.
- Privacidade: webhook não salva nome, CPF, telefone, endereço ou e-mail bruto do comprador.
- Analytics próprio: page views e cliques sem Google Analytics e sem PII.
- Agentes: RADAR, CONTEÚDO, ISCA, PERFIL, CONVERSA, VENDA, RECUPERA, AFILIADOS, ANALISTA e OTIMIZADOR.
- Gemini no backend: a chave nunca vai ao navegador; o RADAR pode usar grounding com Pesquisa Google.
- Fila editorial: aprovar, publicar ou arquivar conteúdo gerado.
- Supabase Cron: execução recorrente sem n8n.
- GitHub Action: transforma artigos publicados no Supabase em páginas HTML estáticas, inclui CTA rastreável para o checkout Hotmart e atualiza `sitemap.xml`.

### O que funciona automaticamente neste pacote

Quando as credenciais forem configuradas, o fluxo real fica: **Radar → conteúdo → publicação estática pesquisável → clique rastreado → checkout Hotmart → Webhook de venda → métricas → análise/otimização**. Produtos e configurações persistem no Supabase e o site público lê o catálogo persistente.

Este pacote **não finge integração que a API pública não oferece**. O agente CONVERSA gera a sequência de e-mails, RECUPERA gera textos de recuperação e AFILIADOS gera kits, mas o disparo por Hotmart Send/WhatsApp e a gestão de afiliados continuam nas ferramentas da Hotmart até existir uma API pública estável e documentada para essas ações. O checkout, o pagamento e o acesso ao produto continuam na Hotmart.

## 0. Antes de publicar

Use um projeto Supabase na região mais próxima possível do público brasileiro. Se o projeto foi criado no Canadá e ainda está vazio, é melhor criar outro antes de começar, pois a região não é trocada diretamente depois.

No repositório, o diretório `supabase/` está **na raiz**. Portanto, na tela do Supabase GitHub Integration, em **Working directory**, coloque exatamente:

```text
.
```

Ative também **Deploy to production** para a branch `main`. Assim, novos arquivos em `supabase/migrations/` e as Edge Functions declaradas em `supabase/config.toml` são aplicados ao projeto quando a `main` é atualizada.

## 1. Substituir os arquivos no GitHub

Envie todo o conteúdo deste ZIP para a raiz do repositório `gatuchocreativelab`.

Arquivos antigos inseguros removidos:

- `tmp_pwd.txt`
- `hash.txt`
- senha/hash embutidos no `index.html`
- CRUD por `localStorage`

Não recrie esses arquivos.

## 2. Configurar a conexão pública do Supabase

No Supabase, abra **Settings → API Keys / Connect** e copie apenas:

1. Project URL, formato `https://xxxxxxxx.supabase.co`;
2. Publishable Key, formato `sb_publishable_...`.

Edite `supabase-config.js`:

```js
window.GATUCHO_CONFIG = Object.freeze({
  supabaseUrl: 'https://SEU_PROJECT_ID.supabase.co',
  supabasePublishableKey: 'sb_publishable_COLE_AQUI',
  siteUrl: 'https://gatuchoestudiocriativo.github.io/gatuchocreativelab',
  publicOrigin: 'https://gatuchoestudiocriativo.github.io'
});
```

Esses dois dados são próprios para uso no navegador. A segurança real fica nas RLS.

**Nunca** coloque `sb_secret_...`, `service_role`, senha do banco, Hottok, Client Secret da Hotmart ou Gemini API Key neste arquivo.

## 3. Criar banco, RLS e dados iniciais

Se **Deploy to production** estiver ligado na integração GitHub/Supabase, o arquivo abaixo será aplicado automaticamente ao enviar a nova `main`:

```text
supabase/migrations/202610130001_gatucho_autopilot.sql
```

Se preferir fazer pelo Dashboard, abra **SQL Editor**, copie o conteúdo completo desse arquivo e execute uma vez.

Depois, confirme em **Table Editor** que existem:

- `admin_users`
- `products`
- `agent_definitions`
- `agent_runs`
- `content_assets`
- `web_events`
- `commerce_events`
- `app_settings`
- `audit_log`

## 4. Criar o acesso administrativo

No Supabase:

1. **Authentication → Users**.
2. Crie manualmente o usuário administrativo com e-mail e uma senha forte.
3. Copie o UUID desse usuário.
4. No SQL Editor, execute:

```sql
insert into public.admin_users (user_id)
values ('COLE_AQUI_O_UUID_DO_USUARIO')
on conflict (user_id) do update set active = true;
```

Se houver uma segunda pessoa administradora, repita com o UUID dela.

Em **Authentication → Providers → Email**, desative cadastro público/sign-up se o painel será somente interno. O `admin.html` não oferece criação de conta, mas desabilitar sign-up no projeto elimina uma superfície desnecessária.

Em **Authentication → URL Configuration** use:

```text
Site URL:
https://gatuchoestudiocriativo.github.io/gatuchocreativelab/

Additional Redirect URL:
https://gatuchoestudiocriativo.github.io/gatuchocreativelab/admin.html
```

## 5. Confirmar o deploy das Edge Functions

A integração do Supabase com GitHub pode fazer isso automaticamente ao publicar a `main`. Confirme em **Edge Functions** que aparecem:

- `track-event`
- `hotmart-webhook`
- `hotmart-sync`
- `agent-runner`
- `system-health`

Se preferir CLI:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_ID
supabase db push
supabase functions deploy
```

## 6. Criar os Secrets do backend

No Supabase, abra **Edge Functions → Secrets** e crie:

```text
PUBLIC_SITE_ORIGIN=https://gatuchoestudiocriativo.github.io
HOTMART_CLIENT_ID=...
HOTMART_CLIENT_SECRET=...
HOTMART_BASIC=...
HOTMART_HOTTOK=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
CRON_SECRET=valor-aleatorio-longo-e-exclusivo
ANALYTICS_SALT=outro-valor-aleatorio-longo-e-exclusivo
```

`CRON_SECRET` e `ANALYTICS_SALT` devem ser valores diferentes e aleatórios. Não os coloque no GitHub.

## 7. Conectar Hotmart Developers

Na Hotmart:

1. Abra **Ferramentas → Credenciais Developers**.
2. Crie uma credencial de produção para o Gatucho.
3. Copie `client_id`, `client_secret` e o token `Basic` para os Secrets correspondentes no Supabase.
4. Não cole essas credenciais em nenhum arquivo do site.

O botão **Sincronizar Hotmart** do admin chama a API pelo backend. Para produtos próprios que tenham `hotmart_product_ucode`, ele consulta as ofertas e grava `direct_offer_link_for_creator` em `products.checkout_url`.

O produto piloto já está com:

```text
hotmart_product_ucode = U96578138R
hotmart_offer_code = 4kz82uzh
```

Depois que as credenciais estiverem configuradas, abra `admin.html → Produtos → Sincronizar Hotmart`. O link público passa a direcionar diretamente ao checkout da oferta, e o pagamento continua inteiramente dentro da Hotmart.

## 8. Configurar Webhook V2 da Hotmart

Na Hotmart:

1. Abra **Ferramentas → Webhook**.
2. Copie o Hottok da conta para o Secret `HOTMART_HOTTOK` do Supabase.
3. Crie uma configuração Webhook versão **2.0.0**.
4. Use esta URL:

```text
https://SEU_PROJECT_ID.supabase.co/functions/v1/hotmart-webhook
```

5. Para o produto piloto, selecione pelo menos os eventos de compra relevantes: aprovada, cancelada/reembolsada e chargeback; pode adicionar outros eventos comerciais que queira acompanhar.
6. Use o botão de teste da Hotmart.

O endpoint valida `X-HOTMART-HOTTOK` antes de processar o payload.

### Privacidade do webhook

O endpoint não persiste os campos brutos de comprador. Ele grava apenas informações como:

- tipo do evento;
- produto e oferta;
- status;
- valor/moeda;
- datas;
- hash irreversível da transação/comprador para deduplicação e análise.

Nome, documento, endereço, telefone e e-mail bruto não são guardados no banco do Gatucho.

## 9. Conectar o Gemini aos agentes

Crie/recupere a Gemini API Key na conta usada pelo projeto e grave somente no Secret:

```text
GEMINI_API_KEY
```

O modelo é configurável por `GEMINI_MODEL`. O pacote vem com `gemini-3.6-flash` como padrão conservador; se quiser trocar, altere apenas o Secret, não o código.

O agente RADAR usa grounding com Pesquisa Google. Os demais usam o contexto do produto, o Radar anterior e as métricas agregadas do funil.

## 10. Testar o sistema antes de ligar o automático

Abra:

```text
https://gatuchoestudiocriativo.github.io/gatuchocreativelab/admin.html
```

Faça nesta ordem:

1. Entre com o usuário administrativo criado no Supabase.
2. Em **Integrações**, confirme Supabase = OK.
3. Configure Secrets até Hotmart e Gemini ficarem OK.
4. Em **Produtos**, clique **Sincronizar Hotmart**.
5. Confirme que o checkout do produto piloto virou um `pay.hotmart.com/...` direto.
6. Em **Agentes**, execute manualmente `RADAR`.
7. Confira o resultado em **Conteúdo**.
8. Execute `CONTEÚDO` e revise o rascunho.
9. Publique o artigo somente depois de verificar qualidade e fontes.
10. Faça uma compra/teste permitido pela sua conta Hotmart e confirme o evento em **Visão geral**.

Somente depois ligue o switch **AUTOPILOT**.

## 11. Agendar os robôs sem n8n

O arquivo:

```text
supabase/cron-template.sql
```

contém os jobs de exemplo para:

- ANALISTA diário;
- RADAR semanal;
- CONTEÚDO semanal;
- OTIMIZADOR semanal.

Antes de executar esse SQL:

1. ative **Integrations → Cron** no Supabase;
2. confirme que `pg_cron` e `pg_net` estão habilitados;
3. defina `CRON_SECRET` nos Edge Function Secrets;
4. no arquivo SQL, troque `SEU_PROJECT_ID` e `COLE_AQUI_O_MESMO_CRON_SECRET`;
5. execute pelo SQL Editor.

O cron pode continuar executando, mas `agent-runner` ignora chamadas agendadas enquanto o switch `AUTOPILOT` estiver desligado.

## 12. Publicação SEO automática no GitHub Pages

Quando um artigo `seo_article` recebe status `publicado`, ele fica no Supabase. O workflow:

```text
.github/workflows/publish-content.yml
```

executa diariamente e materializa artigos como HTML estático em:

```text
/conteudos/
```

Também atualiza `sitemap.xml`.

No GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie:

```text
SUPABASE_URL = https://SEU_PROJECT_ID.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
```

São **Variables**, não precisam ser Secrets, pois ambos são dados públicos do cliente.

Depois, em **Settings → Actions → General → Workflow permissions**, permita **Read and write permissions**, pois o workflow precisa versionar as páginas HTML geradas.

Você também pode executar o workflow manualmente pela aba **Actions → Publicar conteúdo do Autopilot → Run workflow**.

## 13. Hotmart Send

O sistema gera a estratégia e os textos do agente `CONVERSA`, mas este pacote **não inventa uma API privada da Hotmart Send**. Na documentação pública atual, o caminho confiável para captura/comunicação é configurar os formulários e automações do próprio Hotmart Send.

Portanto, há uma configuração inicial manual:

1. crie o formulário do produto no Hotmart Send;
2. habilite consentimento e, se desejar afiliados, rastreamento de afiliação;
3. crie uma automação de nutrição;
4. use a sequência aprovada que aparece no admin em **Conteúdo → email_sequence**.

Depois disso, captura e envio ficam operacionais dentro do ecossistema Hotmart. Em uma segunda etapa, se a Hotmart liberar um endpoint público de escrita para essas automações, ele pode ser ligado ao `CONVERSA` sem mudar a arquitetura.

## 14. Como o funil passa a funcionar

```text
Pesquisa/Google
  ↓
Artigos estáticos gerados pelo CONTEÚDO
  ↓
Produto / material gratuito / Hotmart Send
  ↓
Checkout direto Hotmart
  ↓
Webhook Hotmart V2
  ↓
commerce_events sanitizado no Supabase
  ↓
ANALISTA + OTIMIZADOR
  ↓
novos conteúdos/testes
```

## 15. Regras de segurança que não devem ser removidas

- não colocar `service_role`/`sb_secret` no navegador;
- não permitir CRUD público de `products`, `content_assets` ou métricas;
- não desativar RLS para “resolver” erros de permissão;
- não armazenar payload bruto da Hotmart;
- não publicar `CRON_SECRET`, Hottok ou credenciais Developers;
- não adicionar senhas em `.txt`, JavaScript ou HTML;
- não usar dados sensíveis para segmentação dos agentes;
- manter `admin.html` com `noindex,nofollow` e sem link no site público.

## Arquivos alterados / novos

### Alterados

- `index.html`
- `admin.css`

### Novos

- `admin.html`
- `admin.js`
- `autopilot-public.js`
- `supabase-config.js`
- `.gitignore`
- `.env.example`
- `robots.txt`
- `conteudos/index.html`
- `scripts/build-content.mjs`
- `.github/workflows/publish-content.yml`
- `supabase/config.toml`
- `supabase/migrations/202610130001_gatucho_autopilot.sql`
- `supabase/cron-template.sql`
- `supabase/functions/_shared/*`
- `supabase/functions/track-event/index.ts`
- `supabase/functions/hotmart-webhook/index.ts`
- `supabase/functions/hotmart-sync/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/system-health/index.ts`

### Removidos por segurança

- `hash.txt`
- `tmp_pwd.txt`

