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
//
// Desde a migration 0010, cada unidade pode ter N membros (contas/login) —
// esta tela mostra a unidade (número + ativo/inativo) com a lista de
// membros dela embaixo. Cadastro de unidade nova mora em
// /admin/unidades/nova; adicionar +1 morador a uma unidade já existente
// mora em /admin/unidades/:id/membros/novo (AdicionarMorador.jsx).
export default function AdminUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [membrosPorUnidade, setMembrosPorUnidade] = useState({});
  const [erro, setErro] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id (unidade ou membro) sofrendo ação
  const [editandoId, setEditandoId] = useState(null);
  const [numeroEdicao, setNumeroEdicao] = useState("");

  async function carregar() {
    const [{ data: unidadesData }, { data: membrosData }] = await Promise.all([
      supabase.from("unidade").select("*"),
      supabase.from("membro_unidade").select("*").order("criado_em"),
    ]);
    setUnidades((unidadesData ?? []).sort((a, b) => compararNumero(a.numero, b.numero)));
    const agrupado = {};
    for (const m of membrosData ?? []) {
      (agrupado[m.unidade_id] ??= []).push(m);
    }
    setMembrosPorUnidade(agrupado);
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
    setNumeroEdicao(u.numero);
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(id) {
    setErro(null);
    const { error } = await supabase.from("unidade").update({ numero: numeroEdicao }).eq("id", id);
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }
    setEditandoId(null);
    carregar();
  }

  async function reenviarConvite(m) {
    if (!confirm(`Reenviar convite para ${m.email}? Só funciona se essa conta nunca definiu senha.`)) return;
    setErro(null);
    setAcaoEmAndamento(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=reenviar", {
        body: { membro_id: m.id },
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

  async function removerMembro(m) {
    if (!confirm(`Remover ${m.nome} (${m.email}) desta unidade? Isso não pode ser desfeito.`)) return;
    setErro(null);
    setAcaoEmAndamento(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=excluir", {
        body: { membro_id: m.id },
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

        {unidades.map((u) => {
          const membros = membrosPorUnidade[u.id] ?? [];
          return (
            <div key={u.id} className="card">
              <div className="row row--between" style={{ marginBottom: 4, alignItems: "center" }}>
                {editandoId === u.id ? (
                  <div className="field" style={{ flex: 1, marginRight: 12 }}>
                    Número
                    <input value={numeroEdicao} onChange={(e) => setNumeroEdicao(e.target.value)} />
                  </div>
                ) : (
                  <strong style={{ fontSize: 16 }}>Unidade {u.numero}</strong>
                )}
                <AtivoBadge ativo={u.ativo} />
              </div>

              <div className="stack" style={{ gap: 6, marginTop: 10, marginBottom: 10 }}>
                {membros.length === 0 && <p className="empty-state" style={{ padding: "4px 0" }}>Nenhum morador cadastrado.</p>}
                {membros.map((m) => (
                  <div key={m.id} className="historico-item">
                    <span className="historico-item-texto">
                      <span className="horario-item-titulo">{m.nome}</span>
                      <span className="horario-item-sub" style={{ wordBreak: "break-all" }}>{m.email}</span>
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => reenviarConvite(m)}
                        disabled={acaoEmAndamento === m.id}
                        className="icon-btn"
                        title="Reenviar convite"
                        aria-label="Reenviar convite"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removerMembro(m)}
                        disabled={acaoEmAndamento === m.id}
                        className="icon-btn"
                        title="Remover morador"
                        aria-label="Remover morador"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <Link to={`/admin/unidades/${u.id}/membros/novo`} className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                  + Adicionar morador
                </Link>
              </div>

              <div className="row">
                {editandoId === u.id ? (
                  <>
                    <button onClick={() => salvarEdicao(u.id)} className="btn btn-primary btn-sm">Salvar</button>
                    <button onClick={cancelarEdicao} className="btn btn-ghost btn-sm">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => iniciarEdicao(u)} className="btn btn-secondary btn-sm">
                      Editar número
                    </button>
                    <button onClick={() => alternarAtivo(u)} className="btn btn-secondary btn-sm">
                      {u.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
    </>
  );
}
