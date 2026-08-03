import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { formatarDataHora } from "../../lib/formatarDataHora.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";

// UC-14 — Consultar Histórico Administrativo (RF-26, RF-27)
const STATUS_RESERVA = ["confirmada", "em_andamento", "concluida", "cancelada"];

export default function AdminHistorico() {
  const navigate = useNavigate();
  const [aba, setAba] = useState("reservas");
  const [reservas, setReservas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [unidades, setUnidades] = useState([]);

  const [filtroUnidadeId, setFiltroUnidadeId] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("inicio"); // "inicio" | "fim"
  const [ordemAsc, setOrdemAsc] = useState(false);

  const [filtroSolicitanteId, setFiltroSolicitanteId] = useState("");
  const [filtroSolicitadaId, setFiltroSolicitadaId] = useState("");
  const [ordemAscAlertas, setOrdemAscAlertas] = useState(false);

  useEffect(() => {
    supabase
      .from("unidade")
      .select("id, numero")
      .order("numero")
      .then(({ data }) => setUnidades(data ?? []));
  }, []);

  useEffect(() => {
    if (aba === "reservas") {
      let query = supabase
        .from("reserva")
        .select("*, unidade(numero), ponto_carregamento(nome)");
      if (filtroUnidadeId) query = query.eq("unidade_id", filtroUnidadeId);
      if (filtroStatus) query = query.eq("status", filtroStatus);
      query.then(({ data }) => setReservas(data ?? []));
    } else {
      // Síndico tem SELECT completo em `alerta` (policy alerta_select_admin).
      // Anonimato (RF-20) só vale entre unidades — pro síndico, o histórico
      // mostra as duas pontas: quem avisou e quem atrasou (via reserva
      // atrasada -> unidade dela). O `!inner` em `reserva` é necessário pra
      // o filtro por unidade solicitada (reserva.unidade_id) realmente
      // restringir as linhas — sem ele o PostgREST embeda como LEFT JOIN e
      // o .eq() não filtra nada (mesmo bug já corrigido na Edge Function).
      let queryAlertas = supabase
        .from("alerta")
        .select(
          "*, reserva:reserva_atrasada_id!inner(unidade_id, unidade:unidade_id(numero)), unidade_solicitante:unidade_solicitante_id(numero)"
        );
      if (filtroSolicitanteId) queryAlertas = queryAlertas.eq("unidade_solicitante_id", filtroSolicitanteId);
      if (filtroSolicitadaId) queryAlertas = queryAlertas.eq("reserva.unidade_id", filtroSolicitadaId);
      queryAlertas
        .order("enviado_em", { ascending: ordemAscAlertas })
        .then(({ data }) => setAlertas(data ?? []));
    }
  }, [aba, filtroUnidadeId, filtroStatus, filtroSolicitanteId, filtroSolicitadaId, ordemAscAlertas]);

  // Ordenação por "Fim" precisa ser client-side: a coluna exibida é
  // fim_real quando existe, senão fim_previsto (valor calculado, não dá
  // pra pedir isso direto pro Postgres via .order()).
  const reservasOrdenadas = [...reservas].sort((a, b) => {
    const chave = ordenarPor === "inicio" ? "inicio_previsto" : null;
    const valorA = chave ? a[chave] : a.fim_real ?? a.fim_previsto;
    const valorB = chave ? b[chave] : b.fim_real ?? b.fim_previsto;
    const diff = new Date(valorA) - new Date(valorB);
    return ordemAsc ? diff : -diff;
  });

  return (
    <>
    <NavBar />
    <main className="page">
      <h1 className="section">Histórico Administrativo</h1>

      <div className="row row--between" style={{ marginBottom: 20 }}>
        <div className="row">
          <button onClick={() => setAba("reservas")} className={`btn btn-sm ${aba === "reservas" ? "btn-primary" : "btn-secondary"}`}>
            Reservas
          </button>
          <button onClick={() => setAba("alertas")} className={`btn btn-sm ${aba === "alertas" ? "btn-primary" : "btn-secondary"}`}>
            Alertas de Atraso
          </button>
        </div>
        {aba === "reservas" ? (
          <button onClick={() => navigate("/admin/estatistica-reservas")} className="btn btn-secondary btn-sm">
            Ver estatística de reservas
          </button>
        ) : (
          <button onClick={() => navigate("/admin/estatistica-alertas")} className="btn btn-secondary btn-sm">
            Ver estatística de alertas
          </button>
        )}
      </div>

      {aba === "reservas" && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              Unidade
              <select value={filtroUnidadeId} onChange={(e) => setFiltroUnidadeId(e.target.value)} style={{ height: 32 }}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.numero}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              Status
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ height: 32 }}>
                <option value="">Todos</option>
                {STATUS_RESERVA.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              Ordenar por
              <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={{ height: 32 }}>
                <option value="inicio">Início</option>
                <option value="fim">Fim</option>
              </select>
            </label>
            <button onClick={() => setOrdemAsc((atual) => !atual)} className="btn btn-secondary btn-sm">
              {ordemAsc ? "Crescente ↑" : "Decrescente ↓"}
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ padding: "12px 16px 8px" }}>Unidade</th>
                  <th>Ponto</th>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reservasOrdenadas.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: "12px 16px" }}>{r.unidade?.numero}</td>
                    <td>{r.ponto_carregamento?.nome}</td>
                    <td>{r.tipo}</td>
                    <td>{formatarDataHora(r.inicio_previsto)}</td>
                    <td>{formatarDataHora(r.fim_real ?? r.fim_previsto)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === "alertas" && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              Unidade solicitante
              <select value={filtroSolicitanteId} onChange={(e) => setFiltroSolicitanteId(e.target.value)} style={{ height: 32 }}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.numero}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              Unidade solicitada
              <select value={filtroSolicitadaId} onChange={(e) => setFiltroSolicitadaId(e.target.value)} style={{ height: 32 }}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.numero}</option>
                ))}
              </select>
            </label>
            <button onClick={() => setOrdemAscAlertas((atual) => !atual)} className="btn btn-secondary btn-sm">
              Enviado em: {ordemAscAlertas ? "Crescente ↑" : "Decrescente ↓"}
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ padding: "12px 16px 8px" }}>Unidade Solicitante</th>
                  <th>Unidade Solicitada</th>
                  <th>Enviado em</th>
                  <th>Visualizado em</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: "12px 16px" }}>{a.unidade_solicitante?.numero}</td>
                    <td>{a.reserva?.unidade?.numero}</td>
                    <td>{formatarDataHora(a.enviado_em)}</td>
                    <td>{a.visualizado_em ? formatarDataHora(a.visualizado_em) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
    </>
  );
}
