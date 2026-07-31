import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

// UC-06 (Criar Reserva) / UC-09 (Consultar Histórico) — Wireframes, tela 02
export default function Home() {
  const [pontos, setPontos] = useState([]);

  useEffect(() => {
    supabase
      .from("ponto_carregamento")
      .select("*")
      .eq("ativo", true)
      .then(({ data }) => setPontos(data ?? []));

    // Realtime: reflete disponibilidade sem precisar recarregar a tela
    // (Arquitetura Técnica, seção 3.1)
    const channel = supabase
      .channel("reservas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "reserva" }, () => {
        // TODO: revalidar a query de disponibilidade do ponto selecionado
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Pontos de Carregamento</h1>
      <ul>
        {pontos.map((p) => (
          <li key={p.id}>{p.nome} — máx. diurno {p.duracao_maxima_minutos} min</li>
        ))}
      </ul>
      <Link to="/reservas/nova">+ Nova Reserva</Link>
      {" · "}
      <Link to="/reservas">Minhas Reservas</Link>
    </main>
  );
}
