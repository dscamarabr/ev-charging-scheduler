import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// UC-07, UC-08, UC-09, UC-10 — Wireframes, tela 04
export default function MinhasReservas() {
  const [reservas, setReservas] = useState([]);

  async function carregar() {
    const { data } = await supabase
      .from("reserva")
      .select("*, ponto_carregamento(nome)")
      .order("criado_em", { ascending: false });
    setReservas(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function cancelar(id) {
    await supabase.rpc("cancelar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function liberar(id) {
    await supabase.rpc("liberar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function avisarAtraso(minhaReservaId) {
    // Passa pela Edge Function `alertas`, que preserva o anonimato (RNF-08)
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=disparar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minha_reserva_id: minhaReservaId }),
    });
  }

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Minhas Reservas</h1>
      {reservas.map((r) => (
        <div key={r.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
          <strong>{r.ponto_carregamento?.nome} — {r.tipo}</strong>
          <div>{r.status}</div>
          {r.status === "confirmada" && (
            <button onClick={() => cancelar(r.id)}>Cancelar</button>
          )}
          {r.status === "em_andamento" && (
            <>
              <button onClick={() => liberar(r.id)}>Liberar agora</button>{" "}
              <button onClick={() => cancelar(r.id)}>Cancelar</button>{" "}
              <button onClick={() => avisarAtraso(r.id)}>Avisar atraso</button>
            </>
          )}
        </div>
      ))}
    </main>
  );
}
