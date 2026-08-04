-- =====================================================================
-- Migration: unidade comum passa a enxergar a agenda de todo mundo
--
-- Bug (existe desde a 0001, só ficou visível agora com um 2º morador de
-- verdade testando, já que síndico bypassa via is_admin()): a policy
-- `reserva_select` só liberava `unidade_id = minha_unidade_id()` — uma
-- unidade comum nunca conseguiu ver reserva de OUTRA unidade. A tela de
-- Nova Reserva usa exatamente essa leitura pra calcular o que está
-- ocupado; sem enxergar as reservas alheias, sempre mostrava tudo como
-- livre pra quem não é síndico — mesmo já reservado. O INSERT em si
-- sempre foi bloqueado corretamente pela exclusion constraint (RF-14),
-- que roda no servidor independente de RLS de SELECT — por isso o erro
-- só aparecia ao confirmar, nunca antes.
--
-- Fix: qualquer usuário autenticado (login válido) passa a poder ler a
-- tabela reserva inteira — é exatamente a informação que precisa pra
-- saber se um horário está livre. Mesmo padrão de "leitura liberada"
-- já usado em ponto_carregamento e configuracao_global (0001), só que
-- aqui exigindo login (auth.uid() is not null) em vez de leitura 100%
-- pública, já que reserva.unidade_id identifica quem reservou.
-- =====================================================================

drop policy reserva_select on reserva;

create policy reserva_select on reserva for select
  using (auth.uid() is not null);
