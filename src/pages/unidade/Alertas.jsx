import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// UC-11 — Visualizar Alerta Recebido (RF-20, RF-22) — Wireframes, tela 05
// Lê SEMPRE via Edge Function `alertas`, nunca direto na tabela `alerta`,
// para garantir o anonimato mútuo (RNF-08).
export default function Alertas() {
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    async function carregar() {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=recebidos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await resp.json();
      setAlertas(json.alertas ?? []);
    }
    carregar();
  }, []);

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Alertas Recebidos</h1>
      {alertas.length === 0 && <p>Nenhum alerta no momento.</p>}
      {alertas.map((a) => (
        <div key={a.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
          <strong>Aviso de atraso (anônimo)</strong>
          <div>Recebido em {new Date(a.enviado_em).toLocaleString("pt-BR")}</div>
        </div>
      ))}
    </main>
  );
}
