import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatarDataHora } from "../../lib/formatarDataHora.js";
import NavBar from "../../components/NavBar.jsx";

// UC-11 — Visualizar Alerta Recebido (RF-20, RF-22) — Wireframes, tela 05
// Lê SEMPRE via Edge Function `alertas`, nunca direto na tabela `alerta`,
// para garantir o anonimato mútuo (RNF-08): a aba "Enviados" mostra que
// EU disparei um alerta e se já foi visto, mas nunca revela qual unidade
// recebeu; a aba "Recebidos" mostra que alguém me avisou, mas nunca quem.
export default function Alertas() {
  const [aba, setAba] = useState("recebidos");
  const [recebidos, setRecebidos] = useState([]);
  const [enviados, setEnviados] = useState([]);

  useEffect(() => {
    async function carregar() {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=${aba}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await resp.json();

      if (aba === "recebidos") {
        const lista = json.alertas ?? [];
        const agora = new Date().toISOString();
        // UC-11: abrir esta tela é o próprio ato de "visualizar" o
        // alerta — marca os que ainda não tinham sido vistos, pra quem
        // enviou conseguir ver o status na aba Enviados. Atualiza o
        // horário localmente também, senão a tela mostraria "recebido"
        // sem "visualizado" até a próxima vez que a lista for buscada.
        const listaAtualizada = lista.map((item) =>
          item.visualizado_em ? item : { ...item, visualizado_em: agora }
        );
        setRecebidos(listaAtualizada);
        for (const a of lista.filter((item) => !item.visualizado_em)) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=visualizar`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ alerta_id: a.id }),
          });
        }
      } else {
        setEnviados(json.alertas ?? []);
      }
    }
    carregar();
  }, [aba]);

  return (
    <>
    <NavBar />
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Alertas</h1>
      <div>
        <button onClick={() => setAba("recebidos")} disabled={aba === "recebidos"}>Recebidos</button>{" "}
        <button onClick={() => setAba("enviados")} disabled={aba === "enviados"}>Enviados</button>
      </div>

      {aba === "recebidos" && (
        <>
          {recebidos.length === 0 && <p>Nenhum alerta recebido no momento.</p>}
          {recebidos.map((a) => (
            <div key={a.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
              <strong>Aviso de atraso</strong>
              <div>Recebido em {formatarDataHora(a.enviado_em)}</div>
              <div>Visualizado em {formatarDataHora(a.visualizado_em)}</div>
            </div>
          ))}
        </>
      )}

      {aba === "enviados" && (
        <>
          {enviados.length === 0 && <p>Você ainda não enviou nenhum alerta.</p>}
          {enviados.map((a) => (
            <div key={a.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
              <strong>Alerta enviado</strong>
              <div>Enviado em {formatarDataHora(a.enviado_em)}</div>
              <div>
                {a.visualizado_em
                  ? `Visualizado em ${formatarDataHora(a.visualizado_em)}`
                  : "Ainda não visualizado"}
              </div>
            </div>
          ))}
        </>
      )}
    </main>
    </>
  );
}
