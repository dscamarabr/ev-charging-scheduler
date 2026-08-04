// supabase/functions/send-push/index.ts
//
// Edge Function chamada pelo job agendado (pg_cron + pg_net, ver
// 0002_scheduled_jobs.sql) para efetivamente entregar as notificações
// Web Push de início/fim de reserva (RF-23, RF-24), usando os endpoints
// salvos em push_subscription. O envio em si (assinatura VAPID, limpeza
// de inscrições mortas) mora em supabase/functions/_shared/push.ts,
// compartilhado com a function `alertas` (que dispara push de atraso).
//
// Deploy:  supabase functions deploy send-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ver README seção 4)

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarPushParaUnidade } from "../_shared/push.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const { tipo } = await req.json(); // 'inicio' | 'fim'
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const campoHorario = tipo === "inicio" ? "inicio_previsto" : "fim_previsto";
  const statusEsperado = tipo === "inicio" ? "confirmada" : "em_andamento";

  const agora = new Date();
  const daqui10min = new Date(agora.getTime() + 10 * 60 * 1000);

  // 1. Busca reservas elegíveis que ainda não geraram notificação deste tipo
  const { data: reservas, error } = await supabase
    .from("reserva")
    .select("id, unidade_id")
    .eq("status", statusEsperado)
    .gte(campoHorario, agora.toISOString())
    .lte(campoHorario, daqui10min.toISOString());

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500 });
  }

  let enviadas = 0;

  for (const reserva of reservas ?? []) {
    // 2. Ignora se já existe notificação deste tipo para a reserva
    const { data: existente } = await supabase
      .from("notificacao")
      .select("id")
      .eq("reserva_id", reserva.id)
      .eq("tipo", tipo)
      .maybeSingle();
    if (existente) continue;

    // 3. Envia pra todos os aparelhos inscritos da unidade (todos os
    // membros que moram nela, exceto quem desativou em Perfil).
    enviadas += await enviarPushParaUnidade(supabase, reserva.unidade_id, {
      title: tipo === "inicio" ? "Sua reserva vai começar" : "Sua reserva está terminando",
      body:
        tipo === "inicio"
          ? "Não esqueça de levar seu veículo até o ponto de carregamento."
          : "Lembre-se de retirar o veículo e liberar o ponto.",
      url: "/reservas",
    });

    // 4. Registra o envio (RF-23 / RF-24) — mesmo que não haja nenhuma
    // inscrição de push válida no momento, evita reprocessar essa reserva
    // no próximo minuto.
    await supabase.from("notificacao").insert({ reserva_id: reserva.id, tipo });
  }

  return new Response(JSON.stringify({ processadas: reservas?.length ?? 0, enviadas }), {
    headers: { "Content-Type": "application/json" },
  });
});
