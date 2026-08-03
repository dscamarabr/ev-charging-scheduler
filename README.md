# Sistema de Agendamento de Pontos de Carregamento de Veículos Elétricos

Scaffold inicial do projeto, gerado a partir dos 6 documentos de análise de
sistemas (Documento de Visão, Especificação de Requisitos, Modelo de Dados,
Casos de Uso/User Stories, Wireframes e Arquitetura Técnica — todos v1.0).

Este README cobre a criação e configuração dos **ambientes de
desenvolvimento** (local, staging e produção). O código em si (`src/`,
`supabase/`) é um ponto de partida funcional, não o produto final — vários
pontos estão marcados com `TODO` para o time de desenvolvimento continuar.

---

## 0. Pré-requisitos

- [Node.js](https://nodejs.org) 20+ e npm
- Uma conta no [Supabase](https://supabase.com) (plano gratuito é suficiente
  para o volume atual — ver Arquitetura Técnica, seção 3.4)
- [Supabase CLI](https://supabase.com/docs/guides/cli): `npm install -g supabase`
- Git e uma conta no GitHub (para CI/CD)
- Conta no [Vercel](https://vercel.com) ou [Netlify](https://netlify.com)
  (hospedagem do frontend — qualquer um serve, o workflow de exemplo usa Vercel)

---

## 1. Ambientes: visão geral

A Arquitetura Técnica (seção 10) recomenda separar **produção** de
**staging**, para testar migrations de schema antes de aplicá-las nos dados
reais do condomínio. Este guia propõe 3 ambientes:

| Ambiente     | Supabase project | Frontend                     | Uso |
|--------------|-------------------|-------------------------------|-----|
| **dev**      | local (`supabase start`) | `npm run dev` (localhost) | desenvolvimento do dia a dia |
| **staging**  | projeto Supabase separado | deploy de preview (branch `staging`) | testar migrations e features antes de produção |
| **produção** | projeto Supabase principal | deploy `main` | uso real pelo condomínio |

---

## 2. Ambiente de desenvolvimento local

```bash
# 1. Instale as dependências do frontend
npm install

# 2. Suba o Supabase localmente (Postgres + Auth + Storage + Studio, via Docker)
supabase init          # só na primeira vez
supabase start         # imprime as chaves locais (anon key, service role key, etc.)

# 3. Aplique as migrations no banco local
supabase db push

# 4. Configure o frontend para apontar para o Supabase local
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os valores
# impressos por `supabase start` (geralmente http://localhost:54321 + uma anon key local)

# 5. Rode o frontend
npm run dev
```

Acesse `http://localhost:54323` para o Supabase Studio local (equivalente ao
painel web, mas apontando pro banco local) e `http://localhost:5173` para o
app.

### Criando o primeiro síndico (ambiente local)

Como o cadastro de unidades é feito pelo síndico (RF-01) — não há
self-service — é preciso criar manualmente a primeira conta com
`admin = true` para conseguir usar o painel administrativo:

```sql
-- Rode no SQL editor do Supabase Studio, após criar o usuário em
-- Authentication > Users > Add user (defina um e-mail e senha)
insert into unidade (numero, nome_responsavel, email, auth_user_id, admin)
values ('ADM', 'Síndico', 'sindico@condominio.com', '<auth-user-id-copiado-da-tela>', true);
```

---

## 3. Criando os projetos Supabase (staging e produção)

Repita os passos abaixo **duas vezes** (uma para staging, uma para
produção) — são projetos Supabase independentes:

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**.
2. Escolha um nome (ex.: `ev-scheduler-staging`, `ev-scheduler-prod`),
   senha do banco e região.
3. Em **Project Settings > API**, copie a `Project URL` e a `anon public
   key` — vão para o `.env.staging` / `.env.production` (ver `.env.example`).
4. Habilite as extensões necessárias em **Database > Extensions**:
   `uuid-ossp`, `btree_gist`, `pg_cron`, `pg_net` (ver comentários no topo
   de `supabase/migrations/0001_schema_inicial.sql` e `0002_scheduled_jobs.sql`).
5. Vincule o projeto local ao remoto e aplique as migrations:

   ```bash
   supabase link --project-ref <ref-do-projeto>   # encontrado na URL do dashboard
   supabase db push
   ```

6. Em **Authentication > URL Configuration**, configure a `Site URL` para
   a URL do frontend correspondente (staging ou produção).
7. Ajuste as URLs de `<SEU-PROJETO>` e a `<SERVICE_ROLE_KEY>` dentro de
   `supabase/migrations/0002_scheduled_jobs.sql` antes de rodar em cada
   ambiente (cada projeto tem sua própria URL/chave).
8. Repita a criação do síndico inicial (seção 2 acima), agora via
   **Authentication > Users** do próprio dashboard remoto.

---

## 4. Edge Functions

```bash
supabase functions deploy send-push
supabase functions deploy alertas

# Segredos usados pelas functions (NUNCA no frontend):
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<...>
supabase secrets set VAPID_PUBLIC_KEY=<...>
supabase secrets set VAPID_PRIVATE_KEY=<...>
supabase secrets set VAPID_SUBJECT=mailto:sindico@condominio.com
```

Gere o par de chaves VAPID (necessário para o Web Push, RF-23/RF-24) com:

```bash
npx web-push generate-vapid-keys
```

A chave **pública** vai no `.env` do frontend (`VITE_VAPID_PUBLIC_KEY`); a
**privada** fica só nos secrets da function acima.

> **TODO**: `supabase/functions/send-push/index.ts` está com a chamada real
> de envio (`web-push`) comentada — descomente e ajuste os imports depois
> de decidir a lib de Web Push para Deno.

---

## 5. Hospedagem do frontend (Vercel — ajuste se usar Netlify)

Para cada ambiente (staging e produção):

1. Importe o repositório no Vercel.
2. Configure a branch de produção (`main`) e a de preview (`staging`).
3. Em **Settings > Environment Variables**, adicione `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY` com os valores do
   projeto Supabase correspondente (staging usa o projeto de staging, etc.).
4. HTTPS é automático no Vercel/Netlify — necessário para o service worker
   e o Web Push funcionarem (RNF-01, Arquitetura Técnica seção 3.4).

---

## 6. CI/CD (GitHub Actions)

O workflow em `.github/workflows/deploy.yml` builda o frontend e aplica as
migrations a cada push em `main` ou `staging`. Configure estes secrets em
**GitHub > Settings > Secrets and variables > Actions**:

| Secret | Onde encontrar |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` | Project Settings > API (por ambiente) |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF` | URL do projeto no dashboard |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel > Account Settings > Tokens |

> Como staging e produção são projetos Supabase diferentes, considere usar
> **GitHub Environments** (staging / production) para que cada branch use
> o conjunto de secrets correto automaticamente.

---

## 7. Estrutura do projeto

```
supabase/
  migrations/
    0001_schema_inicial.sql                       — tabelas, constraints (RI-01 a RI-07), RLS, RPCs
    0002_scheduled_jobs.sql                        — pg_cron: liberação automática + gatilho de notificações
    0003_fix_timezone_criar_reserva.sql
    0004_fix_disparar_alerta_status.sql
    0005_fix_disparar_alerta_janela_tolerancia.sql
    0006_fix_criar_reserva_no_passado.sql
    0007_remove_codigos_regra_das_mensagens.sql    — mensagens de erro sem código interno (RN-xx) pro usuário final
    0008_ponto_delete_policy.sql                   — RLS de delete em ponto_carregamento (faltava)
  functions/
    send-push/    — envia o Web Push (RF-23, RF-24) — envio real ainda comentado, ver seção 8
    alertas/       — disparo/leitura do alerta anônimo (RNF-08)
    unidades/      — cadastro de unidade (cria conta no Auth + linha em `unidade`)
  config.toml

src/
  components/  — NavBar, RequireAuth, StatusBadge (StatusBadge/AtivoBadge), Breadcrumb
  lib/         — supabaseClient, traduzirErro, formatarDataHora, mesUtil, compararNumero, telaInicial
  styles/theme.css   — sistema de design "Acolhedor" (cores, componentes reutilizáveis — ver seção 8.1)
  pages/
    unidade/   — Login, AceitarConvite, CriarReserva (tela "Agendar"), MinhasReservas, Alertas, Perfil
    admin/     — AdminHome (hub), Unidades, NovaUnidade, Pontos, NovoPonto, Historico, Estatistica
  App.jsx, main.jsx
```

## 8. O que ainda falta (TODOs conhecidos)

Em ordem de prioridade prática:

1. **Deploy real** — hoje tudo roda contra Supabase local (`127.0.0.1`); não
   há projeto Supabase remoto configurado nem frontend hospedado. É pré-
   requisito pra testar em celular (iOS só recebe push com o site instalado
   via HTTPS, ver seção 4) — seguir seções 3, 5 e 6 deste README.
2. **Push notifications** — infraestrutura pronta (tabela `push_subscription`,
   job que decide quando notificar, Edge Function `send-push`), mas falta:
   - Código no frontend que pede permissão e chama
     `pushManager.subscribe()` (não existe ainda em nenhuma tela).
   - Descomentar/ajustar o envio real (`web-push`) em `send-push/index.ts`.
   - Gerar e configurar as chaves VAPID reais (`npx web-push generate-vapid-keys`).
3. Testes automatizados — nenhum incluído; dado o escopo (uso interno de um
   condomínio, sem transação financeira no próprio app), baixa prioridade
   pra v1.

Já resolvido nesta rodada (não é mais TODO): cadastro de unidade via Edge
Function, seletor de ponto de carregamento em "Agendar", badge "Inativo",
ordenação numérica de unidades.

### 8.1 Padrões de UI estabelecidos ("padrão" do projeto)

Pra manter consistência visual/funcional ao continuar o desenvolvimento
(inclusive em outra conversa/chat), estes são os componentes e convenções já
adotados em todas as telas — reaproveitar em vez de criar variações novas:

- **Listagem de registros**: card de linha com ícone circular + título/
  subtítulo + chevron (classe `.horario-item`, clicável) ou sem chevron pra
  itens não-clicáveis (`.historico-item`). Usado em Agendar, Histórico,
  Estatística.
- **Cadastro de item novo**: nunca inline no fim da lista — sempre em rota
  própria (`/admin/X/novo`), acessada por um botão de ícone (`.icon-btn-primary`,
  círculo preenchido com ícone + "badge cutout" de +) no cabeçalho da lista.
  Ver Unidades/NovaUnidade e Pontos/NovoPonto.
- **Ação secundária só com ícone**: `.icon-btn` (círculo outline 28px) —
  usado por ex. no "reenviar convite" e no toggle de ordenação da Estatística.
- **Abas de navegação dentro de uma tela**: segmented control
  (`.tabs-segmented` / `.tabs-segmented-btn`, com ícone + label), não
  `btn-primary`/`btn-secondary` lado a lado. Ver Histórico, Estatística,
  Alertas.
- **Filtros e ordenação**: cartão recolhível, fechado por padrão
  (`.filtros-toggle` + `.filtros-grid`, campos com label em cima do input).
  Ver Histórico.
- **Detalhes de um registro**: modal (`.modal-overlay` / `.modal-card`) em
  vez de expandir a linha ou navegar pra outra tela.
- **Ordenação de unidades**: sempre crescente, número antes de letras (ex.
  "ADM" vem depois de qualquer número) — usar `compararNumero` de
  `src/lib/compararNumero.js`, nunca `.order("numero")` puro do Supabase
  (texto ordena como string).
- **Breadcrumb**: toda tela administrativa tem `<Breadcrumb itens={[...]} />`
  voltando pro hub `/admin`.
- **Badges de status**: `StatusBadge`/`AtivoBadge` em
  `src/components/StatusBadge.jsx` — não recriar badges inline.
- **Ícones SVG**: sempre com `stroke="currentColor"` explícito (sem isso o
  ícone renderiza invisível — bug que já se repetiu duas vezes no projeto).

## 9. Documentos de referência

Documento de Visão, Especificação de Requisitos, Modelo de Dados, Casos de
Uso/User Stories, Wireframes, Arquitetura Técnica — todos v1.0. Hoje existem
como `.docx` fora deste repositório (pasta irmã `Ponto de Carregamento/`,
fora de `ev-charging-scheduler/`), não versionados em Git. As regras de
negócio neles definidas (RN-01 a RN-09 etc.) são tratadas como fechadas —
qualquer mudança nelas deve ser explicitamente revisada antes de alterar
código.
