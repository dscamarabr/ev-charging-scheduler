import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { AtivoBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-04 (Gerenciar Pontos) — Configuração Global (UC-05/UC-13) mudou pra
// tela própria em /admin/configuracoes (Configuracoes.jsx).
// Cadastro de ponto novo mora em /admin/pontos/novo (NovoPonto.jsx).
export default function AdminPontos() {
  const [pontos, setPontos] = useState([]);
  const [erro, setErro] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id do ponto sofrendo ação

  async function carregar() {
    const { data: p } = await supabase.from("ponto_carregamento").select("*").order("nome");
    setPontos(p ?? []);
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
    </main>
    </>
  );
}
