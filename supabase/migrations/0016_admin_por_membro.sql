-- =====================================================================
-- Migration: admin passa a ser atributo do MEMBRO, não da unidade
--
-- Contexto: hoje "quem é síndico" é um campo em `unidade` (admin bool) —
-- como is_admin() resolve o membro -> unidade e olha unidade.admin, TODOS
-- os membros de uma mesma unidade compartilham o mesmo privilégio.
-- Não dá pra ter, dentro da mesma unidade, uma pessoa admin e outra não.
-- Como cada membro já tem login próprio desde a migration 0010, faz mais
-- sentido esse privilégio ser por pessoa, não por vaga/família — e a
-- tela Unidades ganha, pela primeira vez, uma forma de conceder/remover
-- isso pelo próprio app (antes só dava pra fazer via SQL manual).
--
-- Preserva o acesso de quem já é admin hoje: todo membro de uma unidade
-- atualmente marcada admin=true recebe membro_unidade.admin=true (em vez
-- de escolher arbitrariamente só 1 deles, caso a unidade tenha >1 membro).
-- =====================================================================

alter table membro_unidade add column admin boolean not null default false;

update membro_unidade mu
   set admin = true
  from unidade u
 where u.id = mu.unidade_id
   and u.admin = true;

comment on column membro_unidade.admin is
  'Síndico = membro com admin = true. Por pessoa, não por unidade (ver migration 0016) — pode haver moradores admin e não-admin na mesma unidade.';

-- is_admin() passa a checar o membro direto, sem precisar do join com unidade
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from membro_unidade where auth_user_id = auth.uid() and admin = true
  );
$$;

-- Nenhuma policy referencia unidade.admin diretamente (todas passam por
-- is_admin(), que é função — sem dependência de coluna travando o drop,
-- mesma lição da migration 0010).
alter table unidade drop column admin;
