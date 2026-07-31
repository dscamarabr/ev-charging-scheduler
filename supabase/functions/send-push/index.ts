// supabase/functions/send-push/index.ts
//
// Edge Function chamada pelo job agendado (pg_cron + pg_net, ver
// 0002_scheduled_jobs.sql) para efetivamente entregar as notificações
// Web Push (RF-23, RF-24), usando os endpoints salvos em push_subscription.
//
// Deploy:  supabase functions deploy send-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:sindico@condominio.com
//
// Este arquivo é um ESQUELETO — ajuste a lib de Web Push (ex.: "web-push"
// via npm: especifier no Deno, ou implementação manual do protocolo VAPID)
// antes de usar em produção.

import { createClient } from "npm:@supabase/supabase-js@2";
// import webpush from "npm:web-push@3"; // exemplo de lib para assinar e enviar o push

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

  for (const reserva of reservas ?? []) {
    // 2. Ignora se já existe notificação deste tipo para a reserva
    const { data: existente } = await supabase
      .from("notificacao")
      .select("id")
      .eq("reserva_id", reserva.id)
      .eq("tipo", tipo)
      .maybeSingle();
    if (existente) continue;

    // 3. Busca as inscrições de push da unidade
    const { data: subs } = await supabase
      .from("push_subscription")
      .select("*")
      .eq("unidade_id", reserva.unidade_id);

    for (const sub of subs ?? []) {
      try {
        // await webpush.sendNotification(
        //   { endpoint: sub.endpoint, keys: { p256dh: sub.chave_p256dh, auth: sub.chave_auth } },
        //   JSON.stringify({
        //     title: tipo === "inicio" ? "Sua reserva vai começar" : "Sua reserva está terminando",
        //     body: tipo === "inicio"
        //       ? "Não esqueça de levar seu veículo até o ponto de carregamento."
        //       : "Lembre-se de retirar o veículo e liberar o ponto.",
        //   })
        // );
      } catch (err) {
        // Endpoint inválido/expirado -> remover inscrição (ver Modelo de Dados, seção 4.7)
        await supabase.from("push_subscription").delete().eq("id", sub.id);
      }
    }

    // 4. Registra o envio (RF-23 / RF-24)
    await supabase.from("notificacao").insert({ reserva_id: reserva.id, tipo });
  }

  return new Response(JSON.stringify({ processadas: reservas?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
