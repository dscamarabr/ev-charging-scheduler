// supabase/functions/send-push/index.ts
//
// Edge Function chamada pelo job agendado (pg_cron + pg_net, ver
// 0002_scheduled_jobs.sql) para efetivamente entregar as notificações
// Web Push (RF-23, RF-24), usando os endpoints salvos em push_subscription.
//
// Deploy:  supabase functions deploy send-push
// Secrets (já devem estar setados desde o deploy inicial — ver README
// seção 6): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:sindico@example.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

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

    // 3. Busca as inscrições de push da unidade (de TODOS os membros que
    // moram nela), filtrando quem desativou notificações em Perfil — a
    // inscrição pode continuar existindo no banco por segurança, mas não
    // deve gerar envio (ver migration 0014).
    const { data: subs } = await supabase
      .from("push_subscription")
      .select("*, membro_unidade!inner(notificacoes_ativas)")
      .eq("unidade_id", reserva.unidade_id)
      .eq("membro_unidade.notificacoes_ativas", true);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.chave_p256dh, auth: sub.chave_auth } },
          JSON.stringify({
            title: tipo === "inicio" ? "Sua reserva vai começar" : "Sua reserva está terminando",
            body:
              tipo === "inicio"
                ? "Não esqueça de levar seu veículo até o ponto de carregamento."
                : "Lembre-se de retirar o veículo e liberar o ponto.",
            url: "/reservas",
          })
        );
        enviadas++;
      } catch (err) {
        // 404/410 = endpoint inválido/expirado (usuário desinstalou o app,
        // trocou de aparelho etc.) -> remove a inscrição morta.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscription").delete().eq("id", sub.id);
        }
      }
    }

    // 4. Registra o envio (RF-23 / RF-24) — mesmo que não haja nenhuma
    // inscrição de push válida no momento, evita reprocessar essa reserva
    // no próximo minuto.
    await supabase.from("notificacao").insert({ reserva_id: reserva.id, tipo });
  }

  return new Response(JSON.stringify({ processadas: reservas?.length ?? 0, enviadas }), {
    headers: { "Content-Type": "application/json" },
  });
});
