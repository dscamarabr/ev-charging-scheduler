-- =====================================================================
-- Migration: reserva noturna com início tardio ainda termina às 06h
--
-- Antes: v_fim = p_inicio + interval '9 hours' — ou seja, se ninguém
-- reservasse a janela noturna logo às 21h e alguém tentasse reservar mais
-- tarde (ex.: 23h, porque o bloco ainda estava livre), o fim calculado
-- ia pra 08h, não pra 06h. RN-05 diz que a janela noturna é um bloco
-- FIXO 21h-06h — o fim tem que ser sempre essa virada das 06h, não uma
-- duração fixa de 9h a partir de um início variável.
--
-- Fix: calcula o fim a partir da janela 21h-06h (horário de PAREDE,
-- America/Sao_Paulo — mesma lógica de fuso da migration 0003) em que
-- p_inicio efetivamente cai, em vez de simplesmente somar 9h:
--   - hora local >= 21:00  -> fim = 06:00 do dia seguinte (dia local)
--   - hora local <  06:00  -> fim = 06:00 do mesmo dia local (fim da
--                             janela que começou na noite anterior)
--   - qualquer outro horário (dentro do expediente diurno) não é uma
--     janela noturna válida — erro (bug latente antes desta migration:
--     dava pra criar reserva "noturna" começando de dia, sem essa checagem).
--
-- O frontend (CriarReserva.jsx) passa a oferecer a sugestão noturna de
-- hoje mesmo depois das 21h, com início = agora, desde que o bloco ainda
-- esteja livre — a exclusion constraint (RF-14, no_overlap_no_ponto)
-- continua garantindo que não dá pra reservar por cima de quem já usou
-- parte da janela.
-- =====================================================================

create or replace function criar_reserva(
  p_ponto_id uuid,
  p_tipo varchar,               -- 'diurna' | 'noturna'
  p_inicio timestamptz,
  p_duracao_minutos integer default null  -- obrigatório apenas para 'diurna'
) returns reserva
language plpgsql security definer as $$
declare
  v_unidade_id  uuid;
  v_fim         timestamptz;
  v_config      configuracao_global;
  v_ponto       ponto_carregamento;
  v_reserva     reserva;
  v_fuso        constant text := 'America/Sao_Paulo';
  v_hora_local  time;
  v_dia_local   date;
begin
  select id into v_unidade_id from unidade
    where auth_user_id = auth.uid() and ativo = true;
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

  if p_tipo = 'noturna' then
    -- RN-05 / RI-05: bloco fixo 21h-06h — o fim é sempre a virada das 06h
    -- da janela em que p_inicio cai (ver cabeçalho da migration), não uma
    -- duração fixa de 9h a partir do início.
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
