-- =====================================================================
-- Migration: schema inicial
-- Sistema de Agendamento de Pontos de Carregamento de Veículos Elétricos
--
-- Baseado em:
--   - Modelo_de_Dados.docx (v1.0) — entidades, dicionário de dados, RI-01 a RI-07
--   - Arquitetura_Tecnica.docx (v1.0) — RLS, RPCs, jobs agendados
--
-- Rode com: supabase db push  (ou psql via Supabase CLI / SQL editor)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensões necessárias
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;   -- necessária para o EXCLUDE constraint (RI-02)
-- pg_cron precisa ser habilitada no painel do Supabase (Database > Extensions)
-- antes de rodar supabase/migrations/0002_scheduled_jobs.sql

-- ---------------------------------------------------------------------
-- 1. Unidade
-- ---------------------------------------------------------------------
create table unidade (
  id                uuid primary key default uuid_generate_v4(),
  numero            varchar not null unique,
  nome_responsavel  varchar not null,
  email             varchar not null unique,
  auth_user_id      uuid not null references auth.users(id) on delete cascade,
  admin             boolean not null default false,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on column unidade.admin is
  'Síndico = unidade com admin = true. Não existe entidade administrativa separada (ver Arquitetura Técnica, seção 4).';

-- ---------------------------------------------------------------------
-- 2. PontoCarregamento
-- ---------------------------------------------------------------------
create table ponto_carregamento (
  id                       uuid primary key default uuid_generate_v4(),
  nome                     varchar not null unique,
  ativo                    boolean not null default true,
  duracao_maxima_minutos   integer not null check (duracao_maxima_minutos > 0),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. ConfiguracaoGlobal (singleton — RI-04)
-- ---------------------------------------------------------------------
create table configuracao_global (
  id                  integer primary key default 1 check (id = 1),
  horario_abertura    time not null default '06:00',
  horario_fechamento  time not null default '21:00',
  atualizado_em       timestamptz not null default now(),
  constraint horario_valido check (horario_abertura < horario_fechamento)
);

insert into configuracao_global (id) values (1);

-- ---------------------------------------------------------------------
-- 4. Reserva
-- ---------------------------------------------------------------------
create table reserva (
  id               uuid primary key default uuid_generate_v4(),
  unidade_id       uuid not null references unidade(id),
  ponto_id         uuid not null references ponto_carregamento(id),
  tipo             varchar not null check (tipo in ('diurna', 'noturna')),
  inicio_previsto  timestamptz not null,
  fim_previsto     timestamptz not null,
  inicio_real      timestamptz,
  fim_real         timestamptz,
  status           varchar not null default 'confirmada'
                     check (status in ('confirmada', 'em_andamento', 'concluida', 'cancelada')),
  criado_em        timestamptz not null default now(),
  constraint fim_apos_inicio check (fim_previsto > inicio_previsto)
);

-- RI-01 (RN-01): no máximo 1 reserva ativa/futura por unidade
create unique index uniq_reserva_ativa_por_unidade
  on reserva (unidade_id)
  where status in ('confirmada', 'em_andamento');

-- RI-02 (RF-14): sem sobreposição de horários no mesmo ponto
alter table reserva add constraint no_overlap_no_ponto
  exclude using gist (
    ponto_id with =,
    tstzrange(inicio_previsto, fim_previsto) with &&
  )
  where (status <> 'cancelada');

create index idx_reserva_unidade on reserva (unidade_id);
create index idx_reserva_ponto_periodo on reserva (ponto_id, inicio_previsto, fim_previsto);

-- ---------------------------------------------------------------------
-- 5. Notificacao
-- ---------------------------------------------------------------------
create table notificacao (
  id           uuid primary key default uuid_generate_v4(),
  reserva_id   uuid not null references reserva(id) on delete cascade,
  tipo         varchar not null check (tipo in ('inicio', 'fim')),
  enviado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Alerta
-- ---------------------------------------------------------------------
create table alerta (
  id                       uuid primary key default uuid_generate_v4(),
  reserva_atrasada_id      uuid not null references reserva(id),
  unidade_solicitante_id   uuid not null references unidade(id),
  enviado_em               timestamptz not null default now(),
  visualizado_em           timestamptz
);

-- RI-03 (RN-10): no máximo 1 alerta por reserva atrasada
create unique index uniq_alerta_por_reserva_atrasada
  on alerta (reserva_atrasada_id);

-- ---------------------------------------------------------------------
-- 7. PushSubscription
-- ---------------------------------------------------------------------
create table push_subscription (
  id             uuid primary key default uuid_generate_v4(),
  unidade_id     uuid not null references unidade(id) on delete cascade,
  endpoint       varchar not null unique,
  chave_p256dh   varchar not null,
  chave_auth     varchar not null,
  criado_em      timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table unidade             enable row level security;
alter table ponto_carregamento  enable row level security;
alter table configuracao_global enable row level security;
alter table reserva             enable row level security;
alter table notificacao         enable row level security;
alter table alerta              enable row level security;
alter table push_subscription   enable row level security;

-- Helper: unidade atual é síndico (admin = true)?
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from unidade where auth_user_id = auth.uid() and admin = true
  );
$$;

-- Helper: id da unidade do usuário autenticado
create or replace function minha_unidade_id() returns uuid
language sql stable security definer as $$
  select id from unidade where auth_user_id = auth.uid();
$$;

-- ---- Unidade ----
create policy unidade_select on unidade for select
  using (auth_user_id = auth.uid() or is_admin());

create policy unidade_update on unidade for update
  using (auth_user_id = auth.uid() or is_admin());

create policy unidade_insert_admin on unidade for insert
  with check (is_admin());

-- ---- PontoCarregamento ----
create policy ponto_select_all on ponto_carregamento for select
  using (true);

create policy ponto_insert_admin on ponto_carregamento for insert
  with check (is_admin());

create policy ponto_update_admin on ponto_carregamento for update
  using (is_admin());

-- ---- ConfiguracaoGlobal ----
create policy config_select_all on configuracao_global for select
  using (true);

create policy config_update_admin on configuracao_global for update
  using (is_admin());

-- ---- Reserva ----
-- Sem policy de INSERT/UPDATE direta: toda escrita passa pelas RPCs abaixo
-- (SECURITY DEFINER), que fazem as validações de RN-01, RN-02, RN-04, RN-05, RF-14.
create policy reserva_select on reserva for select
  using (unidade_id = minha_unidade_id() or is_admin());

-- ---- Notificacao ----
create policy notificacao_select on notificacao for select
  using (
    reserva_id in (select id from reserva where unidade_id = minha_unidade_id())
    or is_admin()
  );
-- INSERT feito apenas pelo job agendado, via role de serviço (bypassa RLS).

-- ---- Alerta ----
-- Sem SELECT direto para unidades comuns: leitura anônima passa pela
-- Edge Function dedicada (ver supabase/functions/send-push e Arquitetura
-- Técnica, seção 8). Síndico consulta a tabela completa para o histórico.
create policy alerta_select_admin on alerta for select
  using (is_admin());

-- ---- PushSubscription ----
create policy push_select_self on push_subscription for select
  using (unidade_id = minha_unidade_id());

create policy push_insert_self on push_subscription for insert
  with check (unidade_id = minha_unidade_id());

create policy push_delete_self on push_subscription for delete
  using (unidade_id = minha_unidade_id());

-- =====================================================================
-- RPCs — regras de negócio críticas (RN-01, RN-02, RN-04, RN-05, RN-09)
-- =====================================================================

-- ---------------------------------------------------------------------
-- criar_reserva: RF-08 a RF-14
-- ---------------------------------------------------------------------
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

    -- RN-04 / RI-06: dentro da janela global diurna
    if p_inicio::time < v_config.horario_abertura or v_fim::time > v_config.horario_fechamento then
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

-- ---------------------------------------------------------------------
-- cancelar_reserva: RF-15
-- ---------------------------------------------------------------------
create or replace function cancelar_reserva(p_reserva_id uuid) returns void
language plpgsql security definer as $$
begin
  update reserva set status = 'cancelada'
  where id = p_reserva_id
    and unidade_id = minha_unidade_id()
    and status in ('confirmada', 'em_andamento');

  if not found then
    raise exception 'Reserva não encontrada, não pertence a esta unidade, ou já está encerrada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- liberar_reserva: RF-16 (liberação manual antecipada)
-- ---------------------------------------------------------------------
create or replace function liberar_reserva(p_reserva_id uuid) returns void
language plpgsql security definer as $$
begin
  update reserva set status = 'concluida', fim_real = now()
  where id = p_reserva_id
    and unidade_id = minha_unidade_id()
    and status = 'em_andamento';

  if not found then
    raise exception 'Reserva não encontrada, não pertence a esta unidade, ou não está em andamento';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- disparar_alerta: RF-19 a RF-22 (RN-09, RN-10)
-- ---------------------------------------------------------------------
create or replace function disparar_alerta(p_minha_reserva_id uuid) returns void
language plpgsql security definer as $$
declare
  v_unidade_id  uuid := minha_unidade_id();
  v_minha       reserva;
  v_anterior    reserva;
begin
  select * into v_minha from reserva
    where id = p_minha_reserva_id and unidade_id = v_unidade_id;

  if v_minha is null or v_minha.status <> 'confirmada' or v_minha.inicio_previsto > now() then
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
