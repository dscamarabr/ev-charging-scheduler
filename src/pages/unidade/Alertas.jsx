import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatarHora, agruparPorDia } from "../../lib/formatarDataHora.js";
import NavBar from "../../components/NavBar.jsx";

const ICONE_SINO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// UC-11 — Visualizar Alerta Recebido (RF-20, RF-22) — Wireframes, tela 05
// Lê SEMPRE via Edge Function `alertas`, nunca direto na tabela `alerta`,
// para garantir o anonimato mútuo (RNF-08): a aba "Enviados" mostra que
// EU disparei um alerta e se já foi visto, mas nunca revela qual unidade
// recebeu; a aba "Recebidos" mostra que alguém me avisou, mas nunca quem.
//
// Lista agrupada por dia (Hoje / Ontem / "3 de agosto"), mostrando só o
// horário em cada linha — a data não se repete item a item. Itens em
// destaque (barra lateral + negrito): na aba Recebidos, os que acabaram
// de ser marcados como visualizados agora (novos desde a última vez que
// a tela foi aberta); na aba Enviados, os que o destinatário ainda não
// visualizou.
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
        // enviou conseguir ver o status na aba Enviados. `novo` marca só
        // os que acabaram de ser vistos agora (pra destacar na lista);
        // atualiza o horário localmente também, senão a tela mostraria
        // "recebido" sem "visualizado" até a próxima busca.
        const listaAtualizada = lista.map((item) =>
          item.visualizado_em ? { ...item, novo: false } : { ...item, visualizado_em: agora, novo: true }
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

  const gruposRecebidos = agruparPorDia(recebidos);
  const gruposEnviados = agruparPorDia(enviados);

  return (
    <>
    <NavBar />
    <main className="page">
      <h1 className="section">Alertas</h1>
      <div className="tabs-segmented" style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setAba("recebidos")}
          className={`tabs-segmented-btn${aba === "recebidos" ? " is-ativo" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5" />
            <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          </svg>
          Recebidos
        </button>
        <button
          type="button"
          onClick={() => setAba("enviados")}
          className={`tabs-segmented-btn${aba === "enviados" ? " is-ativo" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Enviados
        </button>
      </div>

      {aba === "recebidos" && (
        recebidos.length === 0 ? (
          <p className="empty-state">Nenhum alerta recebido no momento.</p>
        ) : (
          <div className="card">
            {gruposRecebidos.map((grupo) => (
              <div key={grupo.chave}>
                <p className="alert-group-label">{grupo.rotulo}</p>
                {grupo.itens.map((a) => (
                  <div key={a.id} className={`alert-row${a.novo ? " is-destaque" : ""}`}>
                    <span className="alert-row-icon" aria-hidden="true">{ICONE_SINO}</span>
                    <div>
                      <div style={{ fontWeight: a.novo ? 600 : 500 }}>
                        {formatarHora(a.enviado_em)} · Aviso de atraso
                      </div>
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        Visualizado às {formatarHora(a.visualizado_em)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {aba === "enviados" && (
        enviados.length === 0 ? (
          <p className="empty-state">Você ainda não enviou nenhum alerta.</p>
        ) : (
          <div className="card">
            {gruposEnviados.map((grupo) => (
              <div key={grupo.chave}>
                <p className="alert-group-label">{grupo.rotulo}</p>
                {grupo.itens.map((a) => (
                  <div key={a.id} className={`alert-row${!a.visualizado_em ? " is-destaque" : ""}`}>
                    <span className="alert-row-icon" aria-hidden="true">{ICONE_SINO}</span>
                    <div>
                      <div style={{ fontWeight: !a.visualizado_em ? 600 : 500 }}>
                        {formatarHora(a.enviado_em)} · Alerta enviado
                      </div>
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {a.visualizado_em ? `Visualizado às ${formatarHora(a.visualizado_em)}` : "Ainda não visualizado"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </main>
    </>
  );
}
