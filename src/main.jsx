import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./styles/theme.css";

const queryClient = new QueryClient();

// RNF-01 / sessão persistente: por padrão, o Chrome trata o armazenamento
// de um site como "best effort" e pode limpá-lo sozinho sob pressão de
// espaço (mais provável logo no início, com o app ainda pouco usado) —
// isso apaga o localStorage onde o Supabase guarda a sessão, forçando
// login de novo mesmo com "Time-box"/"Inactivity timeout" desligados no
// projeto. Pedir armazenamento persistente reduz bastante a chance disso
// acontecer (o navegador pode negar, mas o pedido não tem custo).
if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  navigator.storage.persist();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
