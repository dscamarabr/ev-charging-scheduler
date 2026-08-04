// supabase/functions/_shared/push.ts
//
// Helper de envio de Web Push compartilhado entre as Edge Functions que
// precisam notificar uma unidade: `send-push` (RF-23/RF-24 — início/fim
// de reserva, via pg_cron) e `alertas` (alerta de atraso, disparado na
// hora por outra unidade). Convenção "_shared" do Supabase CLI: esta
// pasta não vira uma function própria, só é importada pelas outras.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

let vapidConfigurado = false;

function configurarVapidSeNecessario() {
  if (vapidConfigurado) return;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:sindico@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
}

// Manda `payload` (JSON) pra todos os aparelhos inscritos de uma unidade,
// respeitando o toggle `notificacoes_ativas` de cada membro (migration
// 0014) e limpando inscrições mortas (endpoint expirado/inválido —
// status 404/410 da Web Push Protocol). Retorna quantas foram enviadas
// com sucesso. Precisa de um client com service role (bypassa RLS pra ler
// as inscrições de todos os membros da unidade, não só o do chamador).
export async function enviarPushParaUnidade(
  supabaseAdmin: SupabaseClient,
  unidadeId: string,
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  configurarVapidSeNecessario();

  const { data: subs } = await supabaseAdmin
    .from("push_subscription")
    .select("*, membro_unidade!inner(notificacoes_ativas)")
    .eq("unidade_id", unidadeId)
    .eq("membro_unidade.notificacoes_ativas", true);

  let enviadas = 0;

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.chave_p256dh, auth: sub.chave_auth } },
        JSON.stringify(payload)
      );
      enviadas++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin.from("push_subscription").delete().eq("id", sub.id);
      }
    }
  }

  return enviadas;
}
