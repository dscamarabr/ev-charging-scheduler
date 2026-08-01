-- =====================================================================
-- Migration: corrige comparação de horário em criar_reserva (RN-04)
--
-- Bug: `p_inicio::time` e `v_fim::time` convertem o timestamptz pro
-- horário local usando o TIMEZONE DA SESSÃO do Postgres, que por padrão
-- é UTC — não o horário local do condomínio. Resultado: uma reserva
-- diurna às 18h (horário de Brasília, UTC-3) virava 21h em UTC, e o fim
-- (19h local / 22h UTC) ultrapassava o horário_fechamento (21:00),
-- disparando a exceção de RN-04 mesmo estando dentro do horário de
-- funcionamento real.
--
-- Fix: usar `AT TIME ZONE 'America/Sao_Paulo'` antes do cast pra `time`,
-- que converte o timestamptz pro horário de parede correto independente
-- do timezone da sessão.
--
-- Assunção (não documentada na Arquitetura Técnica nem no Modelo de
-- Dados): o condomínio está no fuso America/Sao_Paulo. Se não for o
-- caso, ajuste a constante abaixo (ou, melhor, promova pra uma coluna
-- em `configuracao_global` caso o sistema passe a atender condomínios
-- em outros fusos).
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
    -- condomínio, não da sessão do Postgres — ver cabeçalho da migration)
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
