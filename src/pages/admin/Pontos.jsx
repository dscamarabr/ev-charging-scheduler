import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// UC-04 (Gerenciar Pontos) / UC-05 e UC-13 (Configuração Global)
export default function AdminPontos() {
  const [pontos, setPontos] = useState([]);
  const [config, setConfig] = useState(null);

  async function carregar() {
    const { data: p } = await supabase.from("ponto_carregamento").select("*").order("nome");
    const { data: c } = await supabase.from("configuracao_global").select("*").single();
    setPontos(p ?? []);
    setConfig(c);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function alternarAtivo(ponto) {
    await supabase.from("ponto_carregamento").update({ ativo: !ponto.ativo }).eq("id", ponto.id);
    carregar();
  }

  async function salvarConfig(e) {
    e.preventDefault();
    await supabase
      .from("configuracao_global")
      .update({
        horario_abertura: config.horario_abertura,
        horario_fechamento: config.horario_fechamento,
      })
      .eq("id", 1);
    carregar();
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Pontos de Carregamento</h1>
      {pontos.map((p) => (
        <div key={p.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
          <strong>{p.nome}</strong> — máx. diurno {p.duracao_maxima_minutos} min — {p.ativo ? "Ativo" : "Inativo"}
          <div><button onClick={() => alternarAtivo(p)}>{p.ativo ? "Desativar" : "Ativar"}</button></div>
        </div>
      ))}

      <h2>Configuração Global</h2>
      {config && (
        <form onSubmit={salvarConfig}>
          <label>
            Horário de abertura
            <input type="time" value={config.horario_abertura} onChange={(e) => setConfig({ ...config, horario_abertura: e.target.value })} />
          </label>
          <label>
            Horário de fechamento
            <input type="time" value={config.horario_fechamento} onChange={(e) => setConfig({ ...config, horario_fechamento: e.target.value })} />
          </label>
          <button type="submit">Salvar Configuração</button>
        </form>
      )}
    </main>
  );
}
