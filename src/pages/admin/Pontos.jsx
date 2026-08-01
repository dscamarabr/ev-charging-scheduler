import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import NavBar from "../../components/NavBar.jsx";

// UC-04 (Gerenciar Pontos) / UC-05 e UC-13 (Configuração Global)
export default function AdminPontos() {
  const [pontos, setPontos] = useState([]);
  const [config, setConfig] = useState(null);
  const [novoPonto, setNovoPonto] = useState({ nome: "", duracao_maxima_minutos: "" });
  const [erro, setErro] = useState(null);

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

  async function atualizarDuracaoMaxima(ponto, minutos) {
    await supabase
      .from("ponto_carregamento")
      .update({ duracao_maxima_minutos: minutos })
      .eq("id", ponto.id);
    carregar();
  }

  async function cadastrarPonto(e) {
    e.preventDefault();
    setErro(null);
    const { error } = await supabase.from("ponto_carregamento").insert({
      nome: novoPonto.nome,
      duracao_maxima_minutos: Number(novoPonto.duracao_maxima_minutos),
    });
    if (error) {
      setErro(error.message);
      return;
    }
    setNovoPonto({ nome: "", duracao_maxima_minutos: "" });
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
    <>
    <NavBar />
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Pontos de Carregamento</h1>
      {pontos.map((p) => (
        <div key={p.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 8 }}>
          <strong>{p.nome}</strong> — {p.ativo ? "Ativo" : "Inativo"}
          <div>
            Máx. diurno (min):{" "}
            <input
              type="number"
              min="1"
              defaultValue={p.duracao_maxima_minutos}
              style={{ width: 80 }}
              onBlur={(e) => {
                const minutos = Number(e.target.value);
                if (minutos > 0 && minutos !== p.duracao_maxima_minutos) {
                  atualizarDuracaoMaxima(p, minutos);
                }
              }}
            />
          </div>
          <div><button onClick={() => alternarAtivo(p)}>{p.ativo ? "Desativar" : "Ativar"}</button></div>
        </div>
      ))}

      <h2>Novo Ponto de Carregamento</h2>
      <form onSubmit={cadastrarPonto}>
        <input
          placeholder="Nome (ex: Pilotis, Garagem)"
          value={novoPonto.nome}
          onChange={(e) => setNovoPonto({ ...novoPonto, nome: e.target.value })}
          required
        />
        <input
          type="number"
          min="1"
          placeholder="Duração máx. diurna (min)"
          value={novoPonto.duracao_maxima_minutos}
          onChange={(e) => setNovoPonto({ ...novoPonto, duracao_maxima_minutos: e.target.value })}
          required
        />
        <button type="submit">Adicionar</button>
        {erro && <p style={{ color: "crimson" }}>{erro}</p>}
      </form>

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
    </>
  );
}
