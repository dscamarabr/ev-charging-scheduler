-- =====================================================================
-- Migration: disparar_alerta passa a devolver a unidade atrasada
--
-- Contexto: agora que o alerta de atraso também dispara um Web Push (ver
-- supabase/functions/_shared/push.ts e alertas/index.ts), a Edge Function
-- precisa saber PRA QUEM mandar o push assim que o alerta é criado — sem
-- isso, teria que adivinhar qual foi o alerta recém-inserido com uma
-- segunda consulta (sujeito a corrida). O anonimato continua garantido:
-- é a função com security definer, rodando no servidor, que sabe a
-- unidade atrasada — ela nunca é devolvida pro FRONTEND (nem antes nem
-- depois desta migration), só pra Edge Function usar internamente.
--
-- `create or replace` não permite mudar o tipo de retorno (void -> table),
-- por isso precisa dropar a função antes.
-- =====================================================================

drop function if exists disparar_alerta(uuid);

create function disparar_alerta(p_minha_reserva_id uuid)
returns table(alerta_id uuid, unidade_atrasada_id uuid)
language plpgsql security definer as $$
declare
  v_unidade_id     uuid := minha_unidade_id();
  v_minha          reserva;
  v_anterior       reserva;
  v_janela_tolerancia constant interval := interval '1 hour';
  v_alerta_id      uuid;
begin
  select * into v_minha from reserva
    where id = p_minha_reserva_id and unidade_id = v_unidade_id;

  if v_minha is null
     or v_minha.status not in ('confirmada', 'em_andamento')
     or v_minha.inicio_previsto > now() then
    raise exception 'Situação inválida para disparo de alerta';
  end if;

  -- Reserva imediatamente anterior no mesmo ponto (por fim_previsto).
  -- Não filtramos por status = 'em_andamento': o job de liberação
  -- automática (0002_scheduled_jobs.sql) já pode ter marcado essa reserva
  -- como 'concluida' no horário previsto, mesmo que o ponto continue
  -- fisicamente ocupado (o sistema não tem visibilidade física — RNF-07).
  --
  -- A janela de tolerância evita pegar uma reserva antiga qualquer: só
  -- entra aqui se o fim previsto dela está no máximo 1h antes do início
  -- da minha reserva — perto o suficiente pra ser plausível que a mesma
  -- pessoa ainda esteja no ponto.
  select * into v_anterior from reserva
    where ponto_id = v_minha.ponto_id
      and status <> 'cancelada'
      and fim_previsto <= v_minha.inicio_previsto
      and fim_previsto >= v_minha.inicio_previsto - v_janela_tolerancia
    order by fim_previsto desc
    limit 1;

  if v_anterior is null or v_anterior.fim_previsto > now() then
    raise exception 'Não há reserva atrasada no momento para este ponto';
  end if;

  insert into alerta (reserva_atrasada_id, unidade_solicitante_id)
  values (v_anterior.id, v_unidade_id)
  returning id into v_alerta_id;

  return query select v_alerta_id, v_anterior.unidade_id;

exception
  when unique_violation then
    raise exception 'Já existe um alerta para esta situação de atraso';
end;
$$;
