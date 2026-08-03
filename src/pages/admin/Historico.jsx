import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatarDataHora } from "../../lib/formatarDataHora.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { compararNumero } from "../../lib/compararNumero.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-14 — Consultar Histórico Administrativo (RF-26, RF-27)
const STATUS_RESERVA = [
  { valor: "confirmada", texto: "Confirmada" },
  { valor: "em_andamento", texto: "Em andamento" },
  { valor: "concluida", texto: "Concluída" },
  { valor: "cancelada", texto: "Cancelada" },
];

export default function AdminHistorico() {
  const [aba, setAba] = useState("reservas");
  const [reservas, setReservas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [pontos, setPontos] = useState([]);

  const [filtroUnidadeId, setFiltroUnidadeId] = useState("");
  const [filtroPontoId, setFiltroPontoId] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("inicio"); // "inicio" | "fim"
  const [ordemAsc, setOrdemAsc] = useState(false);
  const [registroSelecionado, setRegistroSelecionado] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [filtroSolicitanteId, setFiltroSolicitanteId] = useState("");
  const [filtroSolicitadaId, setFiltroSolicitadaId] = useState("");
  const [ordemAscAlertas, setOrdemAscAlertas] = useState(false);
  const [alertaSelecionado, setAlertaSelecionado] = useState(null);

  useEffect(() => {
    supabase
      .from("unidade")
      .select("id, numero")
      .then(({ data }) => setUnidades((data ?? []).sort((a, b) => compararNumero(a.numero, b.numero))));
    supabase
      .from("ponto_carregamento")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setPontos(data ?? []));
  }, []);

  useEffect(() => {
    if (aba === "reservas") {
      let query = supabase
        .from("reserva")
        .select("*, unidade(numero), ponto_carregamento(nome)");
      if (filtroUnidadeId) query = query.eq("unidade_id", filtroUnidadeId);
      if (filtroPontoId) query = query.eq("ponto_id", filtroPontoId);
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
  }, [aba, filtroUnidadeId, filtroPontoId, filtroStatus, filtroSolicitanteId, filtroSolicitadaId, ordemAscAlertas]);

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
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Histórico Administrativo" }]} />
      <h1 className="section">Histórico Administrativo</h1>

      <div className="tabs-segmented" style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setAba("reservas")}
          className={`tabs-segmented-btn${aba === "reservas" ? " is-ativo" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Reservas
        </button>
        <button
          type="button"
          onClick={() => setAba("alertas")}
          className={`tabs-segmented-btn${aba === "alertas" ? " is-ativo" : ""}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Alertas
        </button>
      </div>

      {aba === "reservas" && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <button type="button" className="filtros-toggle" onClick={() => setFiltrosAbertos((atual) => !atual)}>
              <span>Filtros e ordenação</span>
              <svg className={`filtros-toggle-chevron${filtrosAbertos ? " is-aberto" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {filtrosAbertos && (
              <div className="filtros-grid" style={{ marginTop: 16 }}>
                <div className="field">
                  Unidade
                  <select value={filtroUnidadeId} onChange={(e) => setFiltroUnidadeId(e.target.value)}>
                    <option value="">Todas</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.numero}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  Ponto
                  <select value={filtroPontoId} onChange={(e) => setFiltroPontoId(e.target.value)}>
                    <option value="">Todos</option>
                    {pontos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  Status
                  <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                    <option value="">Todos</option>
                    {STATUS_RESERVA.map((s) => (
                      <option key={s.valor} value={s.valor}>{s.texto}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  Ordenar por
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={{ flex: 1 }}>
                      <option value="inicio">Início</option>
                      <option value="fim">Fim</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setOrdemAsc((atual) => !atual)}
                      className="btn btn-secondary"
                      style={{ flexShrink: 0, paddingLeft: 14, paddingRight: 14 }}
                      title={ordemAsc ? "Ordem crescente" : "Ordem decrescente"}
                      aria-label="Alternar ordem"
                    >
                      {ordemAsc ? "↑" : "↓"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="stack">
            {reservasOrdenadas.length === 0 && (
              <p style={{ color: "var(--color-text-muted)" }}>Nenhum registro encontrado.</p>
            )}
            {reservasOrdenadas.map((r) => (
              <button
                key={r.id}
                type="button"
                className="horario-item"
                onClick={() => setRegistroSelecionado(r)}
              >
                <div className="horario-item-icone">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div className="horario-item-texto">
                  <span className="horario-item-titulo">
                    Unidade {r.unidade?.numero}
                  </span>
                  <span className="horario-item-sub">{formatarDataHora(r.inicio_previsto)}</span>
                </div>
                <StatusBadge status={r.status} />
                <svg className="horario-item-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {aba === "alertas" && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <button type="button" className="filtros-toggle" onClick={() => setFiltrosAbertos((atual) => !atual)}>
              <span>Filtros e ordenação</span>
              <svg className={`filtros-toggle-chevron${filtrosAbertos ? " is-aberto" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {filtrosAbertos && (
              <div className="filtros-grid" style={{ marginTop: 16 }}>
                <div className="field">
                  Unidade solicitante
                  <select value={filtroSolicitanteId} onChange={(e) => setFiltroSolicitanteId(e.target.value)}>
                    <option value="">Todas</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.numero}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  Unidade solicitada
                  <select value={filtroSolicitadaId} onChange={(e) => setFiltroSolicitadaId(e.target.value)}>
                    <option value="">Todas</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.numero}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  Enviado em
                  <button
                    type="button"
                    onClick={() => setOrdemAscAlertas((atual) => !atual)}
                    className="btn btn-secondary"
                    style={{ justifyContent: "center" }}
                  >
                    {ordemAscAlertas ? "↑ Crescente" : "↓ Decrescente"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="stack">
            {alertas.length === 0 && (
              <p style={{ color: "var(--color-text-muted)" }}>Nenhum registro encontrado.</p>
            )}
            {alertas.map((a) => (
              <button
                key={a.id}
                type="button"
                className="horario-item"
                onClick={() => setAlertaSelecionado(a)}
              >
                <div className="horario-item-icone">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="horario-item-texto">
                  <span className="horario-item-titulo">
                    Unidade {a.unidade_solicitante?.numero} → Unidade {a.reserva?.unidade?.numero}
                  </span>
                  <span className="horario-item-sub">Enviado em {formatarDataHora(a.enviado_em)}</span>
                </div>
                <svg className="horario-item-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {registroSelecionado && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRegistroSelecionado(null);
          }}
        >
          <div className="modal-card">
            <div className="row row--between" style={{ alignItems: "center", marginBottom: 4 }}>
              <h2 className="section" style={{ marginTop: 0, marginBottom: 0 }}>Detalhes da Reserva</h2>
              <StatusBadge status={registroSelecionado.status} />
            </div>

            <div className="stack" style={{ marginTop: 16 }}>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Unidade</span>
                <strong>{registroSelecionado.unidade?.numero}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Ponto</span>
                <strong>{registroSelecionado.ponto_carregamento?.nome}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Tipo</span>
                <strong style={{ textTransform: "capitalize" }}>{registroSelecionado.tipo}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Início previsto</span>
                <strong>{formatarDataHora(registroSelecionado.inicio_previsto)}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Fim previsto</span>
                <strong>{formatarDataHora(registroSelecionado.fim_previsto)}</strong>
              </div>
              {registroSelecionado.fim_real && (
                <div className="row row--between">
                  <span style={{ color: "var(--color-text-muted)" }}>Fim real</span>
                  <strong>{formatarDataHora(registroSelecionado.fim_real)}</strong>
                </div>
              )}
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Criado em</span>
                <strong>{formatarDataHora(registroSelecionado.criado_em)}</strong>
              </div>
            </div>

            <div className="row" style={{ marginTop: 20 }}>
              <button type="button" onClick={() => setRegistroSelecionado(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {alertaSelecionado && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAlertaSelecionado(null);
          }}
        >
          <div className="modal-card">
            <h2 className="section" style={{ marginTop: 0 }}>Detalhes do Alerta</h2>

            <div className="stack" style={{ marginTop: 16 }}>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Unidade solicitante</span>
                <strong>{alertaSelecionado.unidade_solicitante?.numero}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Unidade solicitada</span>
                <strong>{alertaSelecionado.reserva?.unidade?.numero}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Enviado em</span>
                <strong>{formatarDataHora(alertaSelecionado.enviado_em)}</strong>
              </div>
              <div className="row row--between">
                <span style={{ color: "var(--color-text-muted)" }}>Visualizado em</span>
                <strong>{alertaSelecionado.visualizado_em ? formatarDataHora(alertaSelecionado.visualizado_em) : "—"}</strong>
              </div>
            </div>

            <div className="row" style={{ marginTop: 20 }}>
              <button type="button" onClick={() => setAlertaSelecionado(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}
