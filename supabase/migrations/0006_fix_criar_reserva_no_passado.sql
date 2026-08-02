-- =====================================================================
-- Migration: impede reserva com início no passado (criar_reserva)
--
-- Bug: a função só validava a antecedência MÁXIMA (RN-02, 7 dias), mas
-- nunca checava se `p_inicio` já tinha passado — dava pra reservar pra
-- ontem, ano passado, etc. Regra do projeto é "sem antecedência mínima
-- (pode reservar agora)", não "pode reservar no passado".
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
begin
  select id into v_unidade_id from unidade
    where auth_user_id = auth.uid() and ativo = true;
  if v_unidade_id is null then
    raise exception 'Unidade não encontrada ou inativa';
  end if;

  select * into v_ponto from ponto_carregamento
    where id = p_ponto_id and ativo = true;
  if v_ponto is null then
    raise exception 'Ponto de carregamento inválido ou inativo (RF-05)';
  end if;

  select * into v_config from configuracao_global where id = 1;

  -- Sem antecedência mínima (pode reservar "agora"), mas não no passado.
  if p_inicio < now() then
    raise exception 'Não é possível reservar para uma data/horário no passado';
  end if;

  -- RN-02 / RI-07: antecedência máxima de 7 dias corridos
  if p_inicio > now() + interval '7 days' then
    raise exception 'Antecedência máxima permitida é de 7 dias corridos (RN-02)';
  end if;

  if p_tipo = 'noturna' then
    -- RN-05 / RI-05: bloco fixo de 9h, sem depender da duração informada
    v_fim := p_inicio + interval '9 hours';

  elsif p_tipo = 'diurna' then
    if p_duracao_minutos is null or p_duracao_minutos <= 0 then
      raise exception 'Duração inválida para reserva diurna';
    end if;
    if p_duracao_minutos > v_ponto.duracao_maxima_minutos then
      raise exception 'Duração excede o máximo permitido para este ponto (% min) — RN-04', v_ponto.duracao_maxima_minutos;
    end if;
    v_fim := p_inicio + (p_duracao_minutos || ' minutes')::interval;

    -- RN-04 / RI-06: dentro da janela global diurna (horário de PAREDE do
    -- condomínio, não da sessão do Postgres — ver migration 0003)
    if (p_inicio at time zone v_fuso)::time < v_config.horario_abertura
       or (v_fim at time zone v_fuso)::time > v_config.horario_fechamento then
      raise exception 'Reserva diurna deve estar dentro do horário de funcionamento (% - %) — RN-04', v_config.horario_abertura, v_config.horario_fechamento;
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
    raise exception 'Você já possui uma reserva ativa ou futura (RN-01)';
  when exclusion_violation then
    raise exception 'Horário indisponível: conflito com outra reserva neste ponto (RF-14)';
end;
$$;
