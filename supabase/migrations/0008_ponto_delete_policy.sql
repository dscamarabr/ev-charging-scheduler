-- =====================================================================
-- Migration: permite ao síndico excluir ponto de carregamento
--
-- ponto_carregamento tinha policies de select/insert/update, mas nenhuma
-- de delete. Sem policy pra uma operação, o RLS filtra a linha como se
-- não existisse — um DELETE simplesmente não afeta nenhuma linha, sem
-- erro nenhum (a UI acharia que funcionou, mas nada seria excluído).
--
-- Se existir alguma reserva apontando pra esse ponto (reserva.ponto_id
-- não tem ON DELETE CASCADE de propósito, pra preservar o histórico), o
-- próprio banco recusa a exclusão com "violates foreign key constraint"
-- — já traduzido em src/lib/traduzirErro.js.
-- =====================================================================

create policy ponto_delete_admin on ponto_carregamento for delete
  using (is_admin());
