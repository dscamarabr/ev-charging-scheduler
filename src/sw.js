// Service Worker customizado (RF-23, RF-24) — Web Push.
//
// O modo padrão do vite-plugin-pwa ("generateSW") gera o SW inteiro
// automaticamente e não dá espaço pra código próprio, então não tem como
// reagir a eventos `push`/`notificationclick`. Por isso o vite.config.js
// mudou pra estratégia "injectManifest": o plugin ainda cuida do
// pré-cache (self.__WB_MANIFEST abaixo é substituído no build), mas o
// resto do arquivo é nosso.
import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);

// Recebe a mensagem do servidor (enviada pela Edge Function `send-push`,
// ver supabase/functions/send-push/index.ts) e mostra a notificação
// nativa do sistema.
self.addEventListener("push", (event) => {
  let dados = { title: "Grand Soleil", body: "" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    if (event.data) dados.body = event.data.text();
  }

  const opcoes = {
    body: dados.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: dados.url || "/reservas" },
  };

  event.waitUntil(self.registration.showNotification(dados.title, opcoes));
});

// Toque na notificação — foca uma aba já aberta do app, se existir, ou
// abre uma nova na tela de Minhas Reservas.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/reservas";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) return janela.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
