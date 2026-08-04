-- =====================================================================
-- Migration: liberação antecipada (RF-16) libera o ponto de verdade
--
-- Bug: `liberar_reserva` seta status='concluida' e fim_real=now(), mas
-- NUNCA mexe em fim_previsto — que é o campo usado tanto pela exclusion
-- constraint `no_overlap_no_ponto` quanto pela tela de Nova Reserva pra
-- decidir se o ponto está livre. Resultado: quem libera uma reserva
-- noturna antes das 06h continua "bloqueando" o resto da janela pra
-- outras unidades, porque o intervalo (inicio_previsto, fim_previsto)
-- ainda vai até 06h mesmo a pessoa já tendo saído.
--
-- fim_previsto continua intocado de propósito (é o registro histórico de
-- "até quando estava agendado" — usado em Histórico/Estatística). O que
-- muda é o intervalo usado pra checar conflito: passa a considerar
-- coalesce(fim_real, fim_previsto) — ou seja, se a reserva já foi
-- encerrada (fim_real preenchido, por liberação manual ou pelo job
-- automático), o intervalo "ocupado" termina ali, não em fim_previsto.
-- =====================================================================

alter table reserva drop constraint no_overlap_no_ponto;

alter table reserva add constraint no_overlap_no_ponto
  exclude using gist (
    ponto_id with =,
    tstzrange(inicio_previsto, coalesce(fim_real, fim_previsto)) with &&
  )
  where (status <> 'cancelada');
