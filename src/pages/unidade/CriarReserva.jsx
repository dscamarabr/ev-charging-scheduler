import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import NavBar from "../../components/NavBar.jsx";

// Valores pro atributo `min` dos inputs de data — impede escolher algo no
// passado direto no calendário/relógio do navegador (a RPC criar_reserva
// também rejeita no backend, mas isso evita o usuário nem tentar).
function agoraComoDatetimeLocal() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}T${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
}

function hojeComoData() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

// UC-06 — Criar Reserva (RF-08 a RF-14) — Wireframes, tela 03
export default function CriarReserva() {
  const [pontos, setPontos] = useState([]);
  const [pontoId, setPontoId] = useState("");
  const [tipo, setTipo] = useState("diurna");
  const [inicio, setInicio] = useState(""); // diurna: data + hora livres
  const [dataNoturna, setDataNoturna] = useState(""); // noturna: só a data, hora é sempre 21h
  const [duracao, setDuracao] = useState(180);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("ponto_carregamento")
      .select("*")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        setPontos(data ?? []);
        if (data?.length) setPontoId((atual) => atual || data[0].id);
      });
  }, []);

  const pontoSelecionado = pontos.find((p) => p.id === pontoId);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!pontoId) {
      alert("Selecione um ponto de carregamento.");
      return;
    }

    // RN-05 / RI-05: reserva noturna é sempre o bloco fixo 21h-06h — a
    // unidade só escolhe o dia, não o horário.
    const inicioEscolhido = tipo === "noturna" ? `${dataNoturna}T21:00` : inicio;
    if (!inicioEscolhido) {
      alert(tipo === "noturna" ? "Selecione o dia da reserva." : "Selecione data e horário.");
      return;
    }

    // A validação de RN-01, RN-02, RN-04, RN-05 e RF-14 acontece dentro
    // da RPC (ver supabase/migrations/0001_schema_inicial.sql) — o
    // frontend só repassa a intenção do usuário.
    const { error } = await supabase.rpc("criar_reserva", {
      p_ponto_id: pontoId,
      p_tipo: tipo,
      p_inicio: new Date(inicioEscolhido).toISOString(),
      p_duracao_minutos: tipo === "diurna" ? Number(duracao) : null,
    });

    if (error) {
      alert(error.message);
      return;
    }
    navigate("/reservas");
  }

  return (
    <>
    <NavBar />
    <main style={{ maxWidth: 400, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Nova Reserva</h1>
      {pontos.length === 0 && (
        <p style={{ color: "crimson" }}>
          Nenhum ponto de carregamento ativo no momento. Fale com o síndico.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label>
          Ponto de carregamento
          <select value={pontoId} onChange={(e) => setPontoId(e.target.value)} required>
            {pontos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="diurna">Diurna</option>
            <option value="noturna">Noturna (bloco fixo de 9h, 21h-06h)</option>
          </select>
        </label>
        {tipo === "diurna" ? (
          <label>
            Início
            <input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              min={agoraComoDatetimeLocal()}
              required
            />
          </label>
        ) : (
          <label>
            Dia da reserva
            <input
              type="date"
              value={dataNoturna}
              onChange={(e) => setDataNoturna(e.target.value)}
              min={hojeComoData()}
              required
            />
            <small> horário fixo: 21h às 6h do dia seguinte</small>
          </label>
        )}
        {tipo === "diurna" && (
          <label>
            Duração (minutos)
            <input
              type="number"
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              min={1}
              max={pontoSelecionado?.duracao_maxima_minutos}
            />
            {pontoSelecionado && (
              <small> máx. {pontoSelecionado.duracao_maxima_minutos} min neste ponto</small>
            )}
          </label>
        )}
        <button type="submit" disabled={!pontoId}>Confirmar Reserva</button>
      </form>
    </main>
    </>
  );
}
