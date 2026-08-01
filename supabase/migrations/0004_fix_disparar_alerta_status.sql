-- =====================================================================
-- Migration: corrige a condição de status em disparar_alerta (RN-09)
--
-- Bug: a função exigia que a MINHA reserva estivesse com status =
-- 'confirmada' e inicio_previsto <= now(). Só que o job "transicao-em-
-- andamento" (0002_scheduled_jobs.sql) roda a cada minuto e já vira
-- QUALQUER reserva de 'confirmada' pra 'em_andamento' assim que o
-- inicio_previsto passa — sem checar se o ponto está fisicamente livre
-- (mesma lógica que já era usada, corretamente, pra reserva anterior
-- logo abaixo). Na prática, a janela em que a minha reserva ainda está
-- 'confirmada' com o horário já passado dura no máximo ~1 minuto —
-- exatamente o cenário oposto do botão "Avisar atraso" no frontend, que
-- só aparece quando o status já virou 'em_andamento'. Resultado: o botão
-- quase sempre falhava (RN-09) mesmo em uso legítimo.
--
-- Fix: aceitar tanto 'confirmada' quanto 'em_andamento' pra minha
-- reserva, contanto que o horário de início já tenha passado.
-- =====================================================================

create or replace function disparar_alerta(p_minha_reserva_id uuid) returns void
language plpgsql security definer as $$
declare
  v_unidade_id  uuid := minha_unidade_id();
  v_minha       reserva;
  v_anterior    reserva;
begin
  select * into v_minha from reserva
    where id = p_minha_reserva_id and unidade_id = v_unidade_id;

  if v_minha is null
     or v_minha.status not in ('confirmada', 'em_andamento')
     or v_minha.inicio_previsto > now() then
    raise exception 'Situação inválida para disparo de alerta (RN-09)';
  end if;

  -- Reserva imediatamente anterior no mesmo ponto (por fim_previsto).
  -- Não filtramos por status = 'em_andamento': o job de liberação
  -- automática (0002_scheduled_jobs.sql) já pode ter marcado essa reserva
  -- como 'concluida' no horário previsto, mesmo que o ponto continue
  -- fisicamente ocupado (o sistema não tem visibilidade física — RNF-07).
  -- O que importa para RN-09 é apenas que o fim_previsto dela já passou.
  select * into v_anterior from reserva
    where ponto_id = v_minha.ponto_id
      and status <> 'cancelada'
      and fim_previsto <= v_minha.inicio_previsto
    order by fim_previsto desc
    limit 1;

  if v_anterior is null or v_anterior.fim_previsto > now() then
    raise exception 'Não há reserva atrasada no momento para este ponto (RN-09)';
  end if;

  insert into alerta (reserva_atrasada_id, unidade_solicitante_id)
  values (v_anterior.id, v_unidade_id);

exception
  when unique_violation then
    raise exception 'Já existe um alerta para esta situação de atraso (RN-10)';
end;
$$;
