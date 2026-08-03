import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { AtivoBadge } from "../../components/StatusBadge.jsx";
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
      setErro(traduzirErro(error.message));
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
    <main className="page">
      <h1 className="section">Pontos de Carregamento</h1>

      <div className="stack" style={{ marginBottom: 32 }}>
        {pontos.map((p) => (
          <div key={p.id} className="card">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <strong>{p.nome}</strong>
              <AtivoBadge ativo={p.ativo} />
            </div>
            <div className="row row--between">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                Máx. diurno (min)
                <input
                  type="number"
                  min="1"
                  defaultValue={p.duracao_maxima_minutos}
                  style={{ width: 90, height: 32 }}
                  onBlur={(e) => {
                    const minutos = Number(e.target.value);
                    if (minutos > 0 && minutos !== p.duracao_maxima_minutos) {
                      atualizarDuracaoMaxima(p, minutos);
                    }
                  }}
                />
              </label>
              <button onClick={() => alternarAtivo(p)} className="btn btn-secondary btn-sm">
                {p.ativo ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 32 }}>
        <h2>Novo Ponto de Carregamento</h2>
        <form onSubmit={cadastrarPonto} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            Nome
            <input
              placeholder="Pilotis, Garagem..."
              value={novoPonto.nome}
              onChange={(e) => setNovoPonto({ ...novoPonto, nome: e.target.value })}
              required
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            Duração máx. diurna (min)
            <input
              type="number"
              min="1"
              value={novoPonto.duracao_maxima_minutos}
              onChange={(e) => setNovoPonto({ ...novoPonto, duracao_maxima_minutos: e.target.value })}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">Adicionar</button>
        </form>
        {erro && <p className="form-error" style={{ marginTop: 12 }}>{erro}</p>}
      </div>

      <div className="card">
        <h2>Configuração Global</h2>
        {config && (
          <form onSubmit={salvarConfig} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field">
              Horário de abertura
              <input type="time" value={config.horario_abertura} onChange={(e) => setConfig({ ...config, horario_abertura: e.target.value })} />
            </div>
            <div className="field">
              Horário de fechamento
              <input type="time" value={config.horario_fechamento} onChange={(e) => setConfig({ ...config, horario_fechamento: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Salvar Configuração</button>
          </form>
        )}
      </div>
    </main>
    </>
  );
}
