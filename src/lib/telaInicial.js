import { supabase } from "./supabaseClient";

// Decide pra onde mandar a unidade logo após entrar (login ou aceitar
// convite): se ela já tem uma reserva em andamento/confirmada, faz mais
// sentido cair direto em "Minhas Reservas" em vez do formulário de Nova
// Reserva — que, nesse caso, nem deixaria criar outra (RN-01: 1 reserva
// ativa/futura por unidade).
//
// Inclui "em_andamento" além de "confirmada": é o mesmo status que RN-01
// considera "reserva ativa" (o cron de 0002_scheduled_jobs.sql passa uma
// reserva de confirmada pra em_andamento assim que o horário começa), e
// nesse caso o formulário de Nova Reserva também não serviria pra nada.
export async function obterTelaInicial() {
  const { data: unidadeId } = await supabase.rpc("minha_unidade_id");
  if (!unidadeId) return "/reservas/nova";

  const { data } = await supabase
    .from("reserva")
    .select("id")
    .eq("unidade_id", unidadeId)
    .in("status", ["confirmada", "em_andamento"])
    .limit(1);

  return data && data.length > 0 ? "/reservas" : "/reservas/nova";
}
