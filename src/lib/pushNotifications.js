import { supabase } from "./supabaseClient";

// Web Push (RF-23, RF-24) — inscrição ativa por padrão (decisão do
// síndico): ao logar pela primeira vez num aparelho que ainda não decidiu
// nada sobre notificações ("default"), tentamos inscrever sozinhos. Se o
// morador desativar depois em Perfil, ou negar a permissão do navegador,
// não insistimos de novo sozinhos — só reagimos a uma ação explícita na
// tela (ver Perfil.jsx).

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function pushSuportado() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// Converte a chave pública VAPID (base64url, formato do painel Supabase /
// `web-push generate-vapid-keys`) pro Uint8Array que a Push API exige.
function chaveVapidParaUint8Array(chaveBase64) {
  const padding = "=".repeat((4 - (chaveBase64.length % 4)) % 4);
  const base64 = (chaveBase64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

// membro_id/unidade_id são resolvidos no servidor via auth.uid() (trigger
// da migration 0014) — o cliente só manda o essencial da inscrição.
async function salvarInscricao(subscription) {
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscription").upsert(
    {
      endpoint: json.endpoint,
      chave_p256dh: json.keys.p256dh,
      chave_auth: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  return error;
}

// Pede permissão (se ainda não foi decidida) e garante uma inscrição
// salva no banco pra este aparelho/navegador. Não lança exceção — retorna
// { ok, motivo } pra quem chamou decidir o que mostrar na tela.
export async function inscreverPush() {
  if (!pushSuportado()) return { ok: false, motivo: "indisponivel" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, motivo: "sem_chave_vapid" };

  let permissao = Notification.permission;
  if (permissao === "default") {
    permissao = await Notification.requestPermission();
  }
  if (permissao !== "granted") return { ok: false, motivo: "negado" };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveVapidParaUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const error = await salvarInscricao(subscription);
    if (error) return { ok: false, motivo: "erro_salvar" };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "erro_subscribe" };
  }
}

// Cancela a inscrição deste aparelho e remove do banco — usado quando o
// morador desativa notificações em Perfil, pra não deixar uma inscrição
// "fantasma" que continuaria recebendo push.
export async function cancelarPush() {
  if (!pushSuportado()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from("push_subscription").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {
    // Best effort: mesmo que o cancelamento local falhe, quem chamou esta
    // função já desligou notificacoes_ativas no banco, e a Edge Function
    // send-push filtra por esse campo (migration 0014) — então o envio
    // para antes de precisar depender só do lado do navegador.
  }
}

// Tentativa silenciosa de inscrição automática — chamada 1x por sessão a
// partir da NavBar (RN: notificações vêm ativas por padrão). Só age se
// suportado, permissão ainda não decidida e a preferência do próprio
// membro continua ativa (não foi desligada antes em Perfil).
export async function tentarInscricaoAutomatica() {
  if (!pushSuportado() || Notification.permission !== "default") return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membro } = await supabase
    .from("membro_unidade")
    .select("notificacoes_ativas")
    .eq("auth_user_id", user.id)
    .single();
  if (!membro?.notificacoes_ativas) return;

  await inscreverPush();
}
