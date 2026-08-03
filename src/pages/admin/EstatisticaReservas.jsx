import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { chaveMes, mesLabel } from "../../lib/mesUtil.js";
import NavBar from "../../components/NavBar.jsx";

// Admin: Estatística de Reservas (RF-26) — contagem de reservas por
// unidade, separada por status, agrupada por mês (do mais recente pro
// mais antigo, só meses com registro), ordem decrescente pelo total
// dentro de cada mês.
//
// "em_andamento" não entra nas colunas: é um status transitório (o cron
// de 0002_scheduled_jobs.sql já converte pra "concluida" no fim da
// reserva), então uma reserva passada normalmente não fica parada nele.
// O total continua contando todas as reservas, independente do status.
const STATUS_RESERVA = ["confirmada", "concluida", "cancelada"];

export default function EstatisticaReservas() {
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState([]);
  const [reservas, setReservas] = useState([]);

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

  const reservasPorMes = new Map();
  for (const r of reservas) {
    const mes = chaveMes(r.inicio_previsto);
    if (!reservasPorMes.has(mes)) reservasPorMes.set(mes, []);
    reservasPorMes.get(mes).push(r);
  }
  const meses = [...reservasPorMes.keys()].sort((a, b) => (a < b ? 1 : -1));

  function linhasDoMes(reservasDoMes) {
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
      .sort((a, b) => b.total - a.total);
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <button onClick={() => navigate("/admin/historico")} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        ← Voltar
      </button>
      <h1 className="section">Estatística de Reservas</h1>

      {meses.length === 0 && <p className="empty-state">Nenhuma reserva registrada.</p>}

      {meses.map((mes) => (
        <section key={mes} className="section">
          <h2>{mesLabel(mes)}</h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ padding: "12px 16px 8px" }}>Unidade</th>
                  {STATUS_RESERVA.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhasDoMes(reservasPorMes.get(mes)).map(({ unidade, contagem, total }) => (
                  <tr key={unidade.id}>
                    <td style={{ padding: "12px 16px" }}>{unidade.numero}</td>
                    {STATUS_RESERVA.map((s) => (
                      <td key={s}>{contagem[s]}</td>
                    ))}
                    <td>{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
    </>
  );
}
