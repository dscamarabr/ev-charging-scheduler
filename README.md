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
    0001_schema_inicial.sql   — tabelas, constraints (RI-01 a RI-07), RLS, RPCs
    0002_scheduled_jobs.sql   — pg_cron: liberação automática + gatilho de notificações
  functions/
    send-push/                — envia o Web Push (RF-23, RF-24)
    alertas/                  — disparo/leitura do alerta anônimo (RNF-08)
  config.toml

src/
  lib/supabaseClient.js
  pages/
    unidade/   — Login, Home, CriarReserva, MinhasReservas, Alertas
    admin/     — Unidades, Pontos, Historico
  App.jsx, main.jsx
```

## 8. O que ainda falta (TODOs conhecidos)

- Edge Function de cadastro de unidade (cria conta no Supabase Auth + linha
  em `unidade`) — hoje é só um `alert()` em `AdminUnidades.jsx`.
- Envio real do Web Push em `send-push/index.ts` (lib comentada).
- Seletor de ponto de carregamento em `CriarReserva.jsx` (hoje é um
  placeholder de texto).
- Ícones do PWA em `public/icons/` (192x192 e 512x512 — apenas a referência
  no `manifest.json` foi criada).
- Testes automatizados (nenhum incluído neste scaffold).

## 9. Documentos de referência

Todos em `/mnt/project` (ou onde vocês estiverem versionando os docs):
Documento de Visão, Especificação de Requisitos, Modelo de Dados, Casos de
Uso/User Stories, Wireframes, Arquitetura Técnica — todos v1.0.
