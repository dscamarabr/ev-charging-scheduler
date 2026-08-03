import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro, extrairErroFuncao } from "../../lib/traduzirErro.js";
import { compararNumero } from "../../lib/compararNumero.js";
import { AtivoBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-01 (Cadastrar Unidade) / UC-03 (Editar/Desativar) — requer admin = true
// A política de RLS `unidade_insert_admin` já impede que uma unidade
// comum crie outras unidades; esta tela só funciona para o síndico.
// Cadastro de unidade nova mora em /admin/unidades/nova (NovaUnidade.jsx).
export default function AdminUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [erro, setErro] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id da unidade sofrendo ação
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicao, setFormEdicao] = useState({ numero: "", nome_responsavel: "" });

  async function carregar() {
    const { data } = await supabase.from("unidade").select("*");
    setUnidades((data ?? []).sort((a, b) => compararNumero(a.numero, b.numero)));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function alternarAtivo(u) {
    await supabase.from("unidade").update({ ativo: !u.ativo }).eq("id", u.id);
    carregar();
  }

  function iniciarEdicao(u) {
    setEditandoId(u.id);
    setFormEdicao({ numero: u.numero, nome_responsavel: u.nome_responsavel });
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(id) {
    setErro(null);
    // RLS `unidade_update` já libera admin editar qualquer unidade, sem
    // precisar passar pela Edge Function (não envolve o Auth, só a tabela).
    const { error } = await supabase
      .from("unidade")
      .update({ numero: formEdicao.numero, nome_responsavel: formEdicao.nome_responsavel })
      .eq("id", id);
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }
    setEditandoId(null);
    carregar();
  }

  async function reenviarConvite(u) {
    if (!confirm(`Reenviar convite para ${u.email}? Só funciona se essa unidade nunca definiu senha.`)) return;
    setErro(null);
    setAcaoEmAndamento(u.id);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=reenviar", {
        body: { unidade_id: u.id },
      });
      if (error || data?.error) {
        setErro(traduzirErro(await extrairErroFuncao(error, data)));
        return;
      }
      await carregar();
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  async function excluir(u) {
    if (!confirm(`Excluir a unidade ${u.numero} (${u.email})? Isso não pode ser desfeito.`)) return;
    setErro(null);
    setAcaoEmAndamento(u.id);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=excluir", {
        body: { unidade_id: u.id },
      });
      if (error || data?.error) {
        setErro(traduzirErro(await extrairErroFuncao(error, data)));
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
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Unidades" }]} />
      <div className="row row--between" style={{ alignItems: "center", marginBottom: 20 }}>
        <h1 className="section" style={{ marginBottom: 0 }}>Unidades</h1>
        <Link to="/admin/unidades/nova" className="icon-btn-primary" title="Nova unidade" aria-label="Nova unidade">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-7 9 7" />
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
            {/* Selo de "+" no canto — o círculo cheio "apaga" a casinha por
                baixo antes de desenhar o anel e o sinal, pra não ficar
                sobreposto/ilegível. */}
            <circle className="icon-btn-primary-selo-fundo" cx="18.5" cy="17" r="6" fill="var(--color-primary-600)" stroke="none" />
            <circle cx="18.5" cy="17" r="6" fill="none" strokeWidth="1.6" />
            <path d="M18.5 14.5v5M16 17h5" strokeWidth="1.6" />
          </svg>
        </Link>
      </div>

      {erro && <p className="form-error" style={{ marginBottom: 16 }}>{erro}</p>}

      <div className="stack" style={{ marginBottom: 32 }}>
        {unidades.length === 0 && <p className="empty-state">Nenhuma unidade cadastrada.</p>}

        {unidades.map((u) =>
          editandoId === u.id ? (
            <div key={u.id} className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <div className="field" style={{ flex: 1, minWidth: 70 }}>
                  Número
                  <input
                    value={formEdicao.numero}
                    onChange={(e) => setFormEdicao({ ...formEdicao, numero: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 2, minWidth: 160 }}>
                  Nome do responsável
                  <input
                    value={formEdicao.nome_responsavel}
                    onChange={(e) => setFormEdicao({ ...formEdicao, nome_responsavel: e.target.value })}
                  />
                </div>
              </div>
              <div className="row">
                <button onClick={() => salvarEdicao(u.id)} className="btn btn-primary btn-sm">Salvar</button>
                <button onClick={cancelarEdicao} className="btn btn-ghost btn-sm">Cancelar</button>
              </div>
            </div>
          ) : (
            <div key={u.id} className="card">
              <div className="row row--between" style={{ marginBottom: 4 }}>
                <strong style={{ fontSize: 16 }}>Unidade {u.numero}</strong>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => reenviarConvite(u)}
                    disabled={acaoEmAndamento === u.id}
                    className="icon-btn"
                    title="Reenviar convite"
                    aria-label="Reenviar convite"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </button>
                  <AtivoBadge ativo={u.ativo} />
                </div>
              </div>
              <div style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
                {u.nome_responsavel}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, wordBreak: "break-all" }}>
                {u.email}
              </div>
              <div className="row">
                <button onClick={() => iniciarEdicao(u)} disabled={acaoEmAndamento === u.id} className="btn btn-secondary btn-sm">
                  Editar
                </button>
                <button onClick={() => alternarAtivo(u)} disabled={acaoEmAndamento === u.id} className="btn btn-secondary btn-sm">
                  {u.ativo ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => excluir(u)} disabled={acaoEmAndamento === u.id} className="btn btn-danger btn-sm">
                  Excluir
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </main>
    </>
  );
}
