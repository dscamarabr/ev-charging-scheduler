-- =====================================================================
-- Migration: RPC de leitura pro indicador de uso semanal (tela Nova
-- Reserva) — não é validação de negócio (essa já mora em criar_reserva,
-- migration 0017), é só uma consulta pra mostrar "X de Y reservas usadas
-- esta semana" de forma discreta antes da unidade tentar reservar.
--
-- Mesma definição de "uso" e de "semana" da 0017 (RN-13): reserva que já
-- iniciou (inicio_real preenchido), segunda a domingo em
-- America/Sao_Paulo, somando todos os pontos. Aqui a semana é sempre a
-- ATUAL (baseada em now()), diferente de criar_reserva que calcula a
-- semana de uma data futura escolhida (p_inicio) — faz sentido: o
-- indicador mostra "quanto já usei esta semana", não projeta pro futuro.
-- =====================================================================

create or replace function usos_semana_unidade()
returns table(usados integer, limite integer)
language plpgsql security definer as $$
declare
  v_unidade_id     uuid;
  v_config         configuracao_global;
  v_fuso           constant text := 'America/Sao_Paulo';
  v_inicio_semana  timestamptz;
  v_fim_semana     timestamptz;
begin
  select u.id into v_unidade_id
    from membro_unidade mu
    join unidade u on u.id = mu.unidade_id
    where mu.auth_user_id = auth.uid() and u.ativo = true;
  if v_unidade_id is null then
    raise exception 'Unidade não encontrada ou inativa';
  end if;

  select * into v_config from configuracao_global where id = 1;

  v_inicio_semana := date_trunc('week', now() at time zone v_fuso) at time zone v_fuso;
  v_fim_semana := v_inicio_semana + interval '7 days';

  return query
    select count(*)::integer, v_config.limite_semanal_reservas_por_unidade
    from reserva
    where unidade_id = v_unidade_id
      and inicio_real is not null
      and inicio_previsto >= v_inicio_semana
      and inicio_previsto < v_fim_semana;
end;
$$;
