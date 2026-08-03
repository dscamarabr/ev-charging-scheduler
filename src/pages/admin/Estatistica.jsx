import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { chaveMes, mesLabel } from "../../lib/mesUtil.js";
import { compararNumero } from "../../lib/compararNumero.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// Admin: Estatística (RF-26) — reservas e alertas de atraso agrupados por
// mês (do mais recente pro mais antigo, só meses com registro), com abas
// pra alternar entre os dois relatórios, no mesmo padrão de UC-14
// (Histórico Administrativo).
//
// "em_andamento" não entra nas colunas de reservas: é um status
// transitório (o cron de 0002_scheduled_jobs.sql já converte pra
// "concluida" no fim da reserva), então uma reserva passada normalmente
// não fica parada nele. O total continua contando todas, independente do
// status.
const STATUS_RESERVA = ["confirmada", "concluida", "cancelada"];
const LABEL_STATUS = { confirmada: "Confirmada", concluida: "Concluída", cancelada: "Cancelada" };

const ICONE_CALENDARIO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const ICONE_SINO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// Ícone mostra o critério ATIVO no momento — clicar alterna pro outro.
const ICONE_ORDENAR_UNIDADE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h10M4 18h6" />
  </svg>
);

const ICONE_ORDENAR_TOTAL = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 20V10M12 20V4M18 20v-7" />
  </svg>
);

export default function Estatistica() {
  const [aba, setAba] = useState("reservas");
  const [unidades, setUnidades] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [ordenarPorTotal, setOrdenarPorTotal] = useState(false);

  useEffect(() => {
    supabase
      .from("unidade")
      .select("id, numero")
      .order("numero")
      .then(({ data }) => setUnidades(data ?? []));
  }, []);

  useEffect(() => {
    supabase
      .from("reserva")
      .select("unidade_id, status, inicio_previsto")
      .then(({ data }) => setReservas(data ?? []));
  }, []);

  useEffect(() => {
    // Síndico tem SELECT completo em `alerta` (policy alerta_select_admin).
    // O `!inner` é necessário pro embed de `reserva` vir sempre preenchido
    // e permitir agregar por unidade_id — sem ele o PostgREST usa LEFT
    // JOIN e linhas sem match ficariam com reserva null (mesmo padrão já
    // usado no filtro de Admin: Histórico).
    supabase
      .from("alerta")
      .select("unidade_solicitante_id, enviado_em, reserva:reserva_atrasada_id!inner(unidade_id)")
      .then(({ data }) => setAlertas(data ?? []));
  }, []);

  const reservasPorMes = new Map();
  for (const r of reservas) {
    const mes = chaveMes(r.inicio_previsto);
    if (!reservasPorMes.has(mes)) reservasPorMes.set(mes, []);
    reservasPorMes.get(mes).push(r);
  }
  const mesesReservas = [...reservasPorMes.keys()].sort((a, b) => (a < b ? 1 : -1));

  const alertasPorMes = new Map();
  for (const a of alertas) {
    const mes = chaveMes(a.enviado_em);
    if (!alertasPorMes.has(mes)) alertasPorMes.set(mes, []);
    alertasPorMes.get(mes).push(a);
  }
  const mesesAlertas = [...alertasPorMes.keys()].sort((a, b) => (a < b ? 1 : -1));

  function linhasReservasDoMes(reservasDoMes) {
    return unidades
      .map((u) => {
        const contagem = Object.fromEntries(STATUS_RESERVA.map((s) => [s, 0]));
        let total = 0;
        for (const r of reservasDoMes) {
          if (r.unidade_id === u.id) {
            contagem[r.status] = (contagem[r.status] ?? 0) + 1;
            total += 1;
          }
        }
        return { unidade: u, contagem, total };
      })
      .filter((linha) => linha.total > 0)
      .sort((a, b) =>
        ordenarPorTotal ? b.total - a.total : compararNumero(a.unidade.numero, b.unidade.numero)
      );
  }

  function linhasAlertasDoMes(alertasDoMes) {
    return unidades
      .map((u) => {
        let enviados = 0;
        let recebidos = 0;
        for (const a of alertasDoMes) {
          if (a.unidade_solicitante_id === u.id) enviados += 1;
          if (a.reserva?.unidade_id === u.id) recebidos += 1;
        }
        return { unidade: u, enviados, recebidos, total: enviados + recebidos };
      })
      .filter((linha) => linha.total > 0)
      .sort((a, b) =>
        ordenarPorTotal ? b.total - a.total : compararNumero(a.unidade.numero, b.unidade.numero)
      );
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Estatística" }]} />
      <h1 className="section">Estatística</h1>

      <div className="tabs-segmented" style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setAba("reservas")}
          className={`tabs-segmented-btn${aba === "reservas" ? " is-ativo" : ""}`}
        >
          {ICONE_CALENDARIO}
          Reservas
        </button>
        <button
          type="button"
          onClick={() => setAba("alertas")}
          className={`tabs-segmented-btn${aba === "alertas" ? " is-ativo" : ""}`}
        >
          {ICONE_SINO}
          Alertas
        </button>
      </div>

      {aba === "reservas" && (
        <>
          {mesesReservas.length === 0 && <p className="empty-state">Nenhuma reserva registrada.</p>}
          {mesesReservas.map((mes, indice) => (
            <section key={mes} className="section">
              <div className="row row--between" style={{ alignItems: "center", marginBottom: 4 }}>
                <h2 style={{ marginBottom: 0 }}>{mesLabel(mes)}</h2>
                {indice === 0 && (
                  <button
                    type="button"
                    onClick={() => setOrdenarPorTotal((atual) => !atual)}
                    className="icon-btn"
                    title={ordenarPorTotal ? "Ordenando por total — clique para ordenar por unidade" : "Ordenando por unidade — clique para ordenar por total"}
                    aria-label="Alternar critério de ordenação"
                  >
                    {ordenarPorTotal ? ICONE_ORDENAR_TOTAL : ICONE_ORDENAR_UNIDADE}
                  </button>
                )}
              </div>
              <div className="stack">
                {linhasReservasDoMes(reservasPorMes.get(mes)).map(({ unidade, contagem, total }) => (
                  <div key={unidade.id} className="historico-item">
                    <div className="historico-item-icone">{ICONE_CALENDARIO}</div>
                    <div className="historico-item-info">
                      <strong>Unidade {unidade.numero}</strong>
                      <div className="historico-item-sub">
                        {STATUS_RESERVA.filter((s) => contagem[s] > 0)
                          .map((s) => `${LABEL_STATUS[s]} ${contagem[s]}`)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="badge badge-neutral">{total}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {aba === "alertas" && (
        <>
          {mesesAlertas.length === 0 && <p className="empty-state">Nenhum alerta registrado.</p>}
          {mesesAlertas.map((mes, indice) => (
            <section key={mes} className="section">
              <div className="row row--between" style={{ alignItems: "center", marginBottom: 4 }}>
                <h2 style={{ marginBottom: 0 }}>{mesLabel(mes)}</h2>
                {indice === 0 && (
                  <button
                    type="button"
                    onClick={() => setOrdenarPorTotal((atual) => !atual)}
                    className="icon-btn"
                    title={ordenarPorTotal ? "Ordenando por total — clique para ordenar por unidade" : "Ordenando por unidade — clique para ordenar por total"}
                    aria-label="Alternar critério de ordenação"
                  >
                    {ordenarPorTotal ? ICONE_ORDENAR_TOTAL : ICONE_ORDENAR_UNIDADE}
                  </button>
                )}
              </div>
              <div className="stack">
                {linhasAlertasDoMes(alertasPorMes.get(mes)).map(({ unidade, enviados, recebidos, total }) => (
                  <div key={unidade.id} className="historico-item">
                    <div className="historico-item-icone">{ICONE_SINO}</div>
                    <div className="historico-item-info">
                      <strong>Unidade {unidade.numero}</strong>
                      <div className="historico-item-sub">
                        Enviados {enviados} · Recebidos {recebidos}
                      </div>
                    </div>
                    <span className="badge badge-neutral">{total}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
    </>
  );
}
