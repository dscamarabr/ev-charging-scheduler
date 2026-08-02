import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { chaveMes, mesLabel } from "../../lib/mesUtil.js";
import NavBar from "../../components/NavBar.jsx";

// Admin: Estatística de Alertas (RF-26) — contagem de alertas enviados e
// recebidos por unidade, agrupada por mês (do mais recente pro mais
// antigo, só meses com registro), ordem decrescente pelo total
// (enviados + recebidos) dentro de cada mês.
export default function EstatisticaAlertas() {
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState([]);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    supabase
      .from("unidade")
      .select("id, numero")
      .order("numero")
      .then(({ data }) => setUnidades(data ?? []));
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

  const alertasPorMes = new Map();
  for (const a of alertas) {
    const mes = chaveMes(a.enviado_em);
    if (!alertasPorMes.has(mes)) alertasPorMes.set(mes, []);
    alertasPorMes.get(mes).push(a);
  }
  const meses = [...alertasPorMes.keys()].sort((a, b) => (a < b ? 1 : -1));

  function linhasDoMes(alertasDoMes) {
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
      .sort((a, b) => b.total - a.total);
  }

  return (
    <>
    <NavBar />
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif" }}>
      <button onClick={() => navigate("/admin/historico")}>← Voltar</button>
      <h1>Estatística de Alertas</h1>

      {meses.length === 0 && <p>Nenhum alerta registrado.</p>}

      {meses.map((mes) => (
        <section key={mes} style={{ marginBottom: 32 }}>
          <h2>{mesLabel(mes)}</h2>
          <table width="100%">
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Enviados</th>
                <th>Recebidos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasDoMes(alertasPorMes.get(mes)).map(({ unidade, enviados, recebidos, total }) => (
                <tr key={unidade.id}>
                  <td>{unidade.numero}</td>
                  <td>{enviados}</td>
                  <td>{recebidos}</td>
                  <td>{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
    </>
  );
}
