-- =====================================================================
-- Migration: remove referências a códigos internos (RN-xx, RF-xx) das
-- mensagens mostradas ao usuário final.
--
-- Essas mensagens vêm de `raise exception` e chegam direto na tela via
-- `error.message` (alert()/texto de erro). Códigos como "RN-02" fazem
-- sentido nos comentários do código (referência aos documentos de
-- especificação), mas não pro morador que só quer saber por que a
-- reserva foi recusada. Os comentários com os códigos continuam no
-- código-fonte — só o texto que aparece pro usuário muda.
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
    -- RN-05 / RI-05: bloco fixo de 9h, sem depender da duração informada
    v_fim := p_inicio + interval '9 hours';

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
  values (v_anterior.id, v_unidade_id);

exception
  when unique_violation then
    raise exception 'Já existe um alerta para esta situação de atraso';
end;
$$;
