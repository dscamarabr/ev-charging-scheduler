-- =====================================================================
-- Migration: Web Push de verdade (RF-23, RF-24) — parte 1 (banco)
--
-- Contexto: até aqui `push_subscription` era ligada só a `unidade_id`, o
-- que fazia sentido quando só existia 1 login por unidade. Desde a
-- migration 0010 (múltiplos membros), isso quebra a ideia de "cada membro
-- decide por si" — a Perfil vai ganhar um toggle de notificações
-- (RN: ativo por padrão, cada morador desativa o próprio, sem afetar os
-- outros da mesma unidade). Pra isso, a inscrição de push (que é por
-- APARELHO/navegador) precisa saber a qual MEMBRO pertence, não só a
-- qual unidade.
--
-- A tabela nunca teve inscrição de verdade (o frontend não chamava
-- pushManager.subscribe() em lugar nenhum ainda — ver README seção 8),
-- então é seguro limpar antes de endurecer o schema.
-- =====================================================================

delete from push_subscription;

alter table membro_unidade
  add column notificacoes_ativas boolean not null default true;

alter table push_subscription
  add column membro_id uuid references membro_unidade(id) on delete cascade;

alter table push_subscription
  alter column membro_id set not null;

-- ---------------------------------------------------------------------
-- membro_id e unidade_id passam a ser resolvidos no servidor a partir de
-- auth.uid() (mesmo padrão de criar_reserva) em vez de confiados ao
-- cliente — o frontend só manda endpoint/chaves.
-- ---------------------------------------------------------------------
create or replace function set_push_subscription_membro() returns trigger
language plpgsql security definer as $$
begin
  select mu.id, mu.unidade_id into new.membro_id, new.unidade_id
    from membro_unidade mu where mu.auth_user_id = auth.uid();
  if new.membro_id is null then
    raise exception 'Membro não encontrado para o usuário autenticado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_push_subscription_membro on push_subscription;
create trigger trg_set_push_subscription_membro
  before insert on push_subscription
  for each row execute function set_push_subscription_membro();

-- ---------------------------------------------------------------------
-- RLS: escopo passa de "minha unidade" (qualquer membro mexia na
-- inscrição de qualquer outro da mesma unidade) para "meu próprio
-- aparelho" (só o dono da inscrição vê/edita/apaga a dele).
-- ---------------------------------------------------------------------
drop policy if exists push_select_self on push_subscription;
drop policy if exists push_insert_self on push_subscription;
drop policy if exists push_delete_self on push_subscription;

create policy push_select_self on push_subscription for select
  using (membro_id = (select id from membro_unidade where auth_user_id = auth.uid()) or is_admin());

create policy push_insert_self on push_subscription for insert
  with check (membro_id = (select id from membro_unidade where auth_user_id = auth.uid()));

create policy push_update_self on push_subscription for update
  using (membro_id = (select id from membro_unidade where auth_user_id = auth.uid()))
  with check (membro_id = (select id from membro_unidade where auth_user_id = auth.uid()));

create policy push_delete_self on push_subscription for delete
  using (membro_id = (select id from membro_unidade where auth_user_id = auth.uid()));
