-- =====================================================================
-- Migration: processos automáticos (RF-17, RF-23, RF-24)
--
-- Pré-requisito: habilitar a extensão "pg_cron" no painel do Supabase
-- (Database > Extensions) ANTES de rodar esta migration. Em projetos
-- self-hosted, habilite via `create extension pg_cron;` como superuser.
--
-- Rode com: supabase db push
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net; -- necessária para o job chamar a Edge Function via HTTP

-- ---------------------------------------------------------------------
-- Job 1: confirmada -> em_andamento
-- (Reserva.status transition — ver Modelo de Dados, seção 4.8)
-- ---------------------------------------------------------------------
select cron.schedule(
  'transicao-em-andamento',
  '* * * * *',  -- a cada minuto
  $$
    update reserva
       set status = 'em_andamento',
           inicio_real = inicio_previsto
     where status = 'confirmada'
       and inicio_previsto <= now();
  $$
);

-- ---------------------------------------------------------------------
-- Job 2: liberação automática (RF-17)
-- ---------------------------------------------------------------------
select cron.schedule(
  'liberacao-automatica',
  '* * * * *',
  $$
    update reserva
       set status = 'concluida',
           fim_real = fim_previsto
     where status = 'em_andamento'
       and fim_previsto <= now();
  $$
);

-- ---------------------------------------------------------------------
-- Job 3 e 4: notificações de início/fim (RF-23, RF-24)
--
-- Aqui só é possível *registrar* que a notificação deveria ser enviada
-- (INSERT em notificacao) via SQL puro. O envio real do Web Push (chamada
-- HTTP ao endpoint armazenado em push_subscription, assinada com as
-- chaves VAPID) precisa acontecer em código — por isso este job chama a
-- Edge Function `send-push` via pg_net, passando o id da reserva.
--
-- Ajuste a URL abaixo para a URL pública da sua Edge Function após o
-- deploy (`supabase functions deploy send-push`).
-- ---------------------------------------------------------------------
select cron.schedule(
  'notificar-inicio-proximo',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://<SEU-PROJETO>.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                     'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
      body := jsonb_build_object('tipo', 'inicio')
    )
    where exists (
      select 1 from reserva
       where status = 'confirmada'
         and inicio_previsto between now() and now() + interval '10 minutes'
         and not exists (
           select 1 from notificacao
            where notificacao.reserva_id = reserva.id and notificacao.tipo = 'inicio'
         )
    );
  $$
);

select cron.schedule(
  'notificar-fim-proximo',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://<SEU-PROJETO>.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                     'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
      body := jsonb_build_object('tipo', 'fim')
    )
    where exists (
      select 1 from reserva
       where status = 'em_andamento'
         and fim_previsto between now() and now() + interval '10 minutes'
         and not exists (
           select 1 from notificacao
            where notificacao.reserva_id = reserva.id and notificacao.tipo = 'fim'
         )
    );
  $$
);

-- Para ver os jobs agendados: select * from cron.job;
-- Para remover um job:        select cron.unschedule('nome-do-job');
