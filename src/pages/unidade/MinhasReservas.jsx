import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatarDataHora } from "../../lib/formatarDataHora.js";
import NavBar from "../../components/NavBar.jsx";

// UC-07, UC-08, UC-09, UC-10 — Wireframes, tela 04
export default function MinhasReservas() {
  const [reservas, setReservas] = useState([]);

  async function carregar() {
    // A policy `reserva_select` libera SELECT em toda a tabela pra quem é
    // admin (pra alimentar o Histórico Administrativo) — então, sem esse
    // filtro explícito, um síndico via aqui as reservas de TODAS as
    // unidades em vez de só a própria. minha_unidade_id() garante que esta
    // tela mostra sempre apenas a unidade de quem está logado, admin ou não.
    const { data: minhaUnidadeId } = await supabase.rpc("minha_unidade_id");
    const { data } = await supabase
      .from("reserva")
      .select("*, ponto_carregamento(nome)")
      .eq("unidade_id", minhaUnidadeId)
      .order("criado_em", { ascending: false });
    setReservas(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function cancelar(id) {
    if (!confirm("Cancelar esta reserva? Essa ação não pode ser desfeita.")) return;
    await supabase.rpc("cancelar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function liberar(id) {
    await supabase.rpc("liberar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function avisarAtraso(minhaReservaId) {
    // Passa pela Edge Function `alertas`, que preserva o anonimato (RNF-08).
    // Precisa do Authorization com o JWT do usuário — a function usa esse
    // token pra descobrir a unidade de quem está chamando (via auth.uid()).
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=disparar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ minha_reserva_id: minhaReservaId }),
      });

      if (!resp.ok && resp.status !== 400) {
        // 404 (function não está sendo servida), 401/403, 500 etc. — o
        // corpo pode nem ser JSON (ex.: página de erro do dev server).
        alert(`Falha ao enviar (HTTP ${resp.status}). A Edge Function "alertas" está rodando? (supabase functions serve)`);
        return;
      }

      const json = await resp.json();
      // Sem isso, o clique não dava nenhum retorno visível — sucesso ou erro
      // (ex.: RN-09, "não há reserva atrasada") passavam despercebidos.
      alert(json.error ? `Não foi possível enviar: ${json.error}` : json.mensagem ?? "Alerta enviado.");
    } catch (err) {
      // fetch lança exceção se não conseguir nem conectar (function fora do ar)
      alert(`Não foi possível conectar à Edge Function "alertas": ${err.message}`);
    }
  }

  return (
    <>
    <NavBar />
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Minhas Reservas</h1>
      {reservas.map((r) => (
        <div key={r.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
          <strong>{r.ponto_carregamento?.nome} — {r.tipo}</strong>
          <div>
            {formatarDataHora(r.inicio_previsto)} até {formatarDataHora(r.fim_previsto)}
          </div>
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
    </>
  );
}
