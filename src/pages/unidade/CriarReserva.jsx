import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

// UC-06 — Criar Reserva (RF-08 a RF-14) — Wireframes, tela 03
export default function CriarReserva() {
  const [tipo, setTipo] = useState("diurna");
  const [inicio, setInicio] = useState("");
  const [duracao, setDuracao] = useState(60);
  const [erro, setErro] = useState(null);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);

    // A validação de RN-01, RN-02, RN-04, RN-05 e RF-14 acontece dentro
    // da RPC (ver supabase/migrations/0001_schema_inicial.sql) — o
    // frontend só repassa a intenção do usuário.
    const { error } = await supabase.rpc("criar_reserva", {
      p_ponto_id: "<selecionar-ponto>", // TODO: vir de um <select> populado via Home
      p_tipo: tipo,
      p_inicio: new Date(inicio).toISOString(),
      p_duracao_minutos: tipo === "diurna" ? Number(duracao) : null,
    });

    if (error) {
      setErro(error.message);
      return;
    }
    navigate("/reservas");
  }

  return (
    <main style={{ maxWidth: 400, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Nova Reserva</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="diurna">Diurna</option>
            <option value="noturna">Noturna</option>
          </select>
        </label>
        <label>
          Início
          <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </label>
        {tipo === "diurna" && (
          <label>
            Duração (minutos)
            <input type="number" value={duracao} onChange={(e) => setDuracao(e.target.value)} min={1} />
          </label>
        )}
        {erro && <p style={{ color: "crimson" }}>{erro}</p>}
        <button type="submit">Confirmar Reserva</button>
      </form>
    </main>
  );
}
