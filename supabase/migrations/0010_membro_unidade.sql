-- =====================================================================
-- Migration: múltiplos membros (logins) por unidade
--
-- Gap identificado depois do v1: o modelo original assumia 1 login por
-- unidade (unidade.auth_user_id, 1:1). Na prática, mais de uma pessoa da
-- mesma unidade vai querer login próprio (ex.: casal), compartilhando a
-- mesma reserva/vaga — RN-01 e o resto do sistema já são todos
-- modelados por unidade_id, não por pessoa, então isso já funciona sem
-- mudança nenhuma nas regras de negócio. O que faltava era permitir mais
-- de um `auth_user_id` apontando pra mesma unidade.
--
-- separa "unidade" (numero, ativo, admin — identidade da vaga/família) de
-- "membro_unidade" (quem loga: auth_user_id, nome, email) — N membros
-- por unidade, cada um com sua própria conta/senha, todos com os mesmos
-- poderes sobre a reserva compartilhada da unidade (cancelar, disparar
-- alerta etc. já são checados por unidade_id, então isso sai de graça).
--
-- Telas administrativas continuam mostrando só o número da unidade (não
-- distinguem qual membro fez o quê) — decisão explícita, sem mudança em
-- Histórico/Estatística.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nova tabela
-- ---------------------------------------------------------------------
create table membro_unidade (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid not null references unidade(id) on delete cascade,
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  nome          varchar not null,
  email         varchar not null unique,
  criado_em     timestamptz not null default now()
);

comment on table membro_unidade is
  'Cada linha é uma conta/login que pertence a uma unidade. Uma unidade pode ter N membros (ex.: casal); todos compartilham a mesma reserva/vaga da unidade (RN-01 é por unidade_id).';

create index idx_membro_unidade_unidade on membro_unidade (unidade_id);

-- ---------------------------------------------------------------------
-- 2. Migra os dados existentes (1 membro por unidade já cadastrada)
-- ---------------------------------------------------------------------
insert into membro_unidade (unidade_id, auth_user_id, nome, email, criado_em)
select id, auth_user_id, nome_responsavel, email, criado_em from unidade;

-- ---------------------------------------------------------------------
-- 3. Remove das colunas antigas de `unidade` (agora vivem em membro_unidade)
-- ---------------------------------------------------------------------
alter table unidade drop column nome_responsavel;
alter table unidade drop column email;
alter table unidade drop column auth_user_id;

-- ---------------------------------------------------------------------
-- 4. RLS de membro_unidade
-- ---------------------------------------------------------------------
alter table membro_unidade enable row level security;

create policy membro_select on membro_unidade for select
  using (auth_user_id = auth.uid() or is_admin());

-- Autoatendimento (Perfil): cada membro só edita o próprio nome. Inserts
-- e deletes continuam só via Edge Function `unidades` (service role,
-- porque também mexem no Supabase Auth) — sem policy de insert/delete
-- pra authenticated aqui, de propósito.
create policy membro_update_self on membro_unidade for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. Helpers agora resolvem via membro_unidade em vez de unidade direto
-- ---------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from membro_unidade mu
    join unidade u on u.id = mu.unidade_id
    where mu.auth_user_id = auth.uid() and u.admin = true
  );
$$;

create or replace function minha_unidade_id() returns uuid
language sql stable security definer as $$
  select unidade_id from membro_unidade where auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 6. RLS de `unidade` — não sobrou campo editável por unidade comum
--    (numero/ativo/admin são só do síndico); select continua liberado
--    pra quem pertence à unidade (via minha_unidade_id()) ou é admin.
-- ---------------------------------------------------------------------
drop policy unidade_select on unidade;
drop policy unidade_update on unidade;

create policy unidade_select on unidade for select
  using (is_admin() or id = minha_unidade_id());

create policy unidade_update on unidade for update
  using (is_admin());
