-- =====================================================================
-- Migration: exige proximidade temporal em disparar_alerta (RN-09)
--
-- Bug: a função buscava só "a reserva mais recente antes da minha, no
-- mesmo ponto" — sem checar se ela terminou perto o suficiente do meu
-- início pra fazer sentido como "está no caminho agora". Se não houver
-- nenhuma reserva recente nesse ponto (ex.: gap de dias sem ninguém
-- reservar), a função pegava qualquer reserva antiga (até uma reserva
-- SUA de dias atrás) e tratava como "atrasada", disparando um alerta
-- sem sentido nenhum — inclusive pra você mesmo, no caso relatado.
--
-- Fix: só considera a reserva anterior como bloqueando agora se o fim
-- previsto dela estiver dentro de uma janela de tolerância de 1 hora
-- antes do início da minha reserva. Fora dessa janela, não há reserva
-- "atrasada" o suficiente pra justificar o alerta.
-- =====================================================================

create or replace function disparar_alerta(p_minha_reserva_id uuid) returns void
language plpgsql security definer as $$
declare
  v_unidade_id     uuid := minha_unidade_id();
  v_minha          reserva;
  v_anterior       reserva;
  v_janela_tolerancia constant interval := interval '1 hour';
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
    raise exception 'Não há reserva atrasada no momento para este ponto (RN-09)';
  end if;

  insert into alerta (reserva_atrasada_id, unidade_solicitante_id)
  values (v_anterior.id, v_unidade_id);

exception
  when unique_violation then
    raise exception 'Já existe um alerta para esta situação de atraso (RN-10)';
end;
$$;
