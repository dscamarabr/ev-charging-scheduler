import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { AtivoBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-04 (Gerenciar Pontos) / UC-05 e UC-13 (Configuração Global)
// Cadastro de ponto novo mora em /admin/pontos/novo (NovoPonto.jsx).
export default function AdminPontos() {
  const [pontos, setPontos] = useState([]);
  const [config, setConfig] = useState(null);
  const [erro, setErro] = useState(null);
  const [sucessoConfig, setSucessoConfig] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id do ponto sofrendo ação

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

  async function excluirPonto(ponto) {
    if (!confirm(`Excluir o ponto "${ponto.nome}"? Isso não pode ser desfeito.`)) return;
    setErro(null);
    setAcaoEmAndamento(ponto.id);
    try {
      // RLS `ponto_delete_admin` libera a exclusão pro síndico. Se houver
      // reservas apontando pra este ponto, o próprio banco recusa (a FK
      // reserva.ponto_id não tem cascade, de propósito, pra preservar o
      // histórico) — o erro chega traduzido via traduzirErro.
      const { error } = await supabase.from("ponto_carregamento").delete().eq("id", ponto.id);
      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }
      await carregar();
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  async function salvarConfig(e) {
    e.preventDefault();
    setErro(null);
    setSucessoConfig(false);
    const { error } = await supabase
      .from("configuracao_global")
      .update({
        horario_abertura: config.horario_abertura,
        horario_fechamento: config.horario_fechamento,
        limite_semanal_reservas_por_unidade: config.limite_semanal_reservas_por_unidade,
      })
      .eq("id", 1);
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }
    setSucessoConfig(true);
    setTimeout(() => setSucessoConfig(false), 4000);
    carregar();
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Pontos de Carregamento" }]} />
      <div className="row row--between" style={{ alignItems: "center", marginBottom: 20 }}>
        <h1 className="section" style={{ marginBottom: 0 }}>Pontos de Carregamento</h1>
        <Link to="/admin/pontos/novo" className="icon-btn-primary" title="Novo ponto de carregamento" aria-label="Novo ponto de carregamento">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 L4 14h6l-1 8 9-12h-6z" />
            <circle className="icon-btn-primary-selo-fundo" cx="18.5" cy="17" r="6" fill="var(--color-primary-600)" stroke="none" />
            <circle cx="18.5" cy="17" r="6" fill="none" strokeWidth="1.6" />
            <path d="M18.5 14.5v5M16 17h5" strokeWidth="1.6" />
          </svg>
        </Link>
      </div>

      {erro && <p className="form-error" style={{ marginBottom: 16 }}>{erro}</p>}

      <div className="stack" style={{ marginBottom: 32 }}>
        {pontos.map((p) => (
          <div key={p.id} className="card">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <strong>{p.nome}</strong>
              <AtivoBadge ativo={p.ativo} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginBottom: 12 }}>
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
            <div className="row">
              <button onClick={() => alternarAtivo(p)} disabled={acaoEmAndamento === p.id} className="btn btn-secondary btn-sm">
                {p.ativo ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => excluirPonto(p)} disabled={acaoEmAndamento === p.id} className="btn btn-danger btn-sm">
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Configuração Global</h2>
        {config && (
          <form onSubmit={salvarConfig} className="stack">
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div className="field">
                Horário de abertura
                <input type="time" value={config.horario_abertura} onChange={(e) => setConfig({ ...config, horario_abertura: e.target.value })} />
              </div>
              <div className="field">
                Horário de fechamento
                <input type="time" value={config.horario_fechamento} onChange={(e) => setConfig({ ...config, horario_fechamento: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 260 }}>
              Limite semanal de reservas por unidade
              <input
                type="number"
                min="1"
                value={config.limite_semanal_reservas_por_unidade}
                onChange={(e) =>
                  setConfig({ ...config, limite_semanal_reservas_por_unidade: Number(e.target.value) })
                }
              />
              {/* Soma reservas em todos os pontos, de segunda a domingo — só
                  conta reserva que chegou a iniciar (ver migration 0017). */}
              <small style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                Conta reservas que já iniciaram (não as canceladas antes de começar), somando todos os pontos.
                Semana de segunda a domingo.
              </small>
            </div>
            {erro && <p className="form-error">{erro}</p>}
            {sucessoConfig && <p className="form-success">Configuração salva com sucesso!</p>}
            <div className="row">
              <button type="submit" className="btn btn-primary">Salvar Configuração</button>
            </div>
          </form>
        )}
      </div>
    </main>
    </>
  );
}
