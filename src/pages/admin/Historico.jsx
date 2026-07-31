import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// UC-14 — Consultar Histórico Administrativo (RF-26, RF-27)
export default function AdminHistorico() {
  const [aba, setAba] = useState("reservas");
  const [reservas, setReservas] = useState([]);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    if (aba === "reservas") {
      supabase
        .from("reserva")
        .select("*, unidade(numero), ponto_carregamento(nome)")
        .order("criado_em", { ascending: false })
        .then(({ data }) => setReservas(data ?? []));
    } else {
      // Síndico tem SELECT completo em `alerta` (policy alerta_select_admin)
      supabase
        .from("alerta")
        .select("*, reserva:reserva_atrasada_id(unidade_id), unidade_solicitante:unidade_solicitante_id(numero)")
        .order("enviado_em", { ascending: false })
        .then(({ data }) => setAlertas(data ?? []));
    }
  }, [aba]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Histórico Administrativo</h1>
      <div>
        <button onClick={() => setAba("reservas")} disabled={aba === "reservas"}>Reservas</button>{" "}
        <button onClick={() => setAba("alertas")} disabled={aba === "alertas"}>Alertas de Atraso</button>
      </div>

      {aba === "reservas" && (
        <table width="100%">
          <thead><tr><th>Unidade</th><th>Ponto</th><th>Tipo</th><th>Início</th><th>Status</th></tr></thead>
          <tbody>
            {reservas.map((r) => (
              <tr key={r.id}>
                <td>{r.unidade?.numero}</td>
                <td>{r.ponto_carregamento?.nome}</td>
                <td>{r.tipo}</td>
                <td>{new Date(r.inicio_previsto).toLocaleString("pt-BR")}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aba === "alertas" && (
        <table width="100%">
          <thead><tr><th>Unidade Solicitante</th><th>Enviado em</th><th>Visualizado em</th></tr></thead>
          <tbody>
            {alertas.map((a) => (
              <tr key={a.id}>
                <td>{a.unidade_solicitante?.numero}</td>
                <td>{new Date(a.enviado_em).toLocaleString("pt-BR")}</td>
                <td>{a.visualizado_em ? new Date(a.visualizado_em).toLocaleString("pt-BR") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
