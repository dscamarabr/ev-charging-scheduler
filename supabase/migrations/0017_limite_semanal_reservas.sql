-- =====================================================================
-- Migration: limite semanal de reservas por unidade (RN-13)
--
-- Decisões confirmadas com o síndico (2026-08):
-- - "Uso" = reserva que já INICIOU (inicio_real preenchido), não importa
--   se depois foi concluída normalmente ou cancelada durante o período
--   (RF-15 permite cancelar "antes ou durante"). Reserva cancelada ANTES
--   de iniciar nunca conta, porque o job "transicao-em-andamento" (ver
--   0002_scheduled_jobs.sql) só preenche inicio_real quando o horário
--   previsto efetivamente chega — cancelar antes disso deixa
--   inicio_real null pra sempre.
-- - Limite é por UNIDADE, somado entre TODOS os pontos de carregamento
--   (mesma lógica de RN-01: "1 reserva ativa, independente do ponto").
-- - Configuração única pro condomínio inteiro, em ConfiguracaoGlobal
--   (mesmo padrão de horario_abertura/horario_fechamento) — a tela de
--   admin que edita isso continua sendo a de Pontos de Carregamento
--   (Pontos.jsx), só que o dado não pertence a nenhum ponto específico.
-- - Semana de segunda a domingo, ancorada no dia de INÍCIO da reserva
--   (mesmo critério já usado pra janela noturna 21h-06h, RI-05): uma
--   reserva noturna de domingo 21h a segunda 06h conta pra semana que
--   está terminando (domingo), não pra que está começando.
-- =====================================================================

alter table configuracao_global
  add column limite_semanal_reservas_por_unidade integer not null default 5
    constraint limite_semanal_positivo check (limite_semanal_reservas_por_unidade > 0);

create or replace function criar_reserva(
  p_ponto_id uuid,
  p_tipo varchar,               -- 'diurna' | 'noturna'
  p_inicio timestamptz,
  p_duracao_minutos integer default null  -- obrigatório apenas para 'diurna'
) returns reserva
language plpgsql security definer as $$
declare
  v_unidade_id      uuid;
  v_fim             timestamptz;
  v_config          configuracao_global;
  v_ponto           ponto_carregamento;
  v_reserva         reserva;
  v_fuso            constant text := 'America/Sao_Paulo';
  v_hora_local      time;
  v_dia_local       date;
  v_inicio_semana   timestamptz;
  v_fim_semana      timestamptz;
  v_usos_semana     integer;
begin
  select u.id into v_unidade_id
    from membro_unidade mu
    join unidade u on u.id = mu.unidade_id
    where mu.auth_user_id = auth.uid() and u.ativo = true;
  if v_unidade_id is null then
    raise exception 'Unidade não encontrada ou inativa';
  end if;

  select * into v_ponto from ponto_carregamento
    where id = p_ponto_id and ativo = true;
  if v_ponto is null then
    raise exception 'Ponto de carregamento inválido ou inativo';
  end if;

  select * into v_config from configuracao_global where id = 1;

  -- Sem antecedência mínima (pode reservar "agora"), mas não no passado.
  if p_inicio < now() then
    raise exception 'Não é possível reservar para uma data/horário no passado';
  end if;

  -- RN-02 / RI-07: antecedência máxima de 7 dias corridos
  if p_inicio > now() + interval '7 days' then
    raise exception 'Antecedência máxima permitida é de 7 dias corridos';
  end if;

  -- RN-13 / RI-12: limite semanal de usos por unidade (soma de todos os
  -- pontos). "Semana" calculada a partir do próprio p_inicio (não de
  -- now()) porque uma reserva pode ser feita até 7 dias à frente e cair
  -- na semana seguinte, que tem sua própria cota zerada.
  -- date_trunc('week', ...) já usa segunda-feira como primeiro dia do
  -- ISO 8601, exatamente a regra combinada.
  v_inicio_semana := date_trunc('week', p_inicio at time zone v_fuso) at time zone v_fuso;
  v_fim_semana := v_inicio_semana + interval '7 days';

  select count(*) into v_usos_semana
    from reserva
    where unidade_id = v_unidade_id
      and inicio_real is not null
      and inicio_previsto >= v_inicio_semana
      and inicio_previsto < v_fim_semana;

  if v_usos_semana >= v_config.limite_semanal_reservas_por_unidade then
    raise exception 'Limite semanal de % reservas atingido para esta unidade — a cota renova na segunda-feira', v_config.limite_semanal_reservas_por_unidade;
  end if;

  if p_tipo = 'noturna' then
    -- RN-05 / RI-05: bloco fixo 21h-06h — o fim é sempre a virada das 06h
    -- da janela em que p_inicio cai (ver 0009), não uma duração fixa de
    -- 9h a partir do início.
    v_hora_local := (p_inicio at time zone v_fuso)::time;
    v_dia_local  := (p_inicio at time zone v_fuso)::date;

    if v_hora_local >= time '21:00' then
      v_fim := (v_dia_local + 1 + time '06:00') at time zone v_fuso;
    elsif v_hora_local < time '06:00' then
      v_fim := (v_dia_local + time '06:00') at time zone v_fuso;
    else
      raise exception 'Reserva noturna só pode começar dentro da janela 21h-06h';
    end if;

  elsif p_tipo = 'diurna' then
    if p_duracao_minutos is null or p_duracao_minutos <= 0 then
      raise exception 'Duração inválida para reserva diurna';
    end if;
    if p_duracao_minutos > v_ponto.duracao_maxima_minutos then
      raise exception 'Duração excede o máximo permitido para este ponto (% min)', v_ponto.duracao_maxima_minutos;
    end if;
    v_fim := p_inicio + (p_duracao_minutos || ' minutes')::interval;

    -- RN-04 / RI-06: dentro da janela global diurna (horário de PAREDE do
    -- condomínio, não da sessão do Postgres — ver migration 0003)
    if (p_inicio at time zone v_fuso)::time < v_config.horario_abertura
       or (v_fim at time zone v_fuso)::time > v_config.horario_fechamento then
      raise exception 'Reserva diurna deve estar dentro do horário de funcionamento (% - %)', v_config.horario_abertura, v_config.horario_fechamento;
    end if;

  else
    raise exception 'Tipo de reserva inválido: % (use diurna ou noturna)', p_tipo;
  end if;

  -- RN-01 (índice único parcial) e RF-14 (exclusion constraint) são
  -- garantidos pelo próprio INSERT — se violados, caem nos handlers abaixo.
  insert into reserva (unidade_id, ponto_id, tipo, inicio_previsto, fim_previsto, status)
  values (v_unidade_id, p_ponto_id, p_tipo, p_inicio, v_fim, 'confirmada')
  returning * into v_reserva;

  return v_reserva;

exception
  when unique_violation then
    raise exception 'Você já possui uma reserva ativa ou futura';
  when exclusion_violation then
    raise exception 'Horário indisponível: conflito com outra reserva neste ponto';
end;
$$;
