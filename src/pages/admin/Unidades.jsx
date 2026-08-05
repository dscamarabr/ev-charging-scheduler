import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro, extrairErroFuncao } from "../../lib/traduzirErro.js";
import { compararNumero } from "../../lib/compararNumero.js";
import { AtivoBadge, MembroStatusBadge, MembroAdminBadge } from "../../components/StatusBadge.jsx";
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
  const [ativados, setAtivados] = useState(new Set());
  const [erro, setErro] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id (unidade ou membro) sofrendo ação
  const [editandoId, setEditandoId] = useState(null);
  const [numeroEdicao, setNumeroEdicao] = useState("");

  async function carregar() {
    const [{ data: unidadesData }, { data: membrosData }, statusResp] = await Promise.all([
      supabase.from("unidade").select("*"),
      supabase.from("membro_unidade").select("*").order("criado_em"),
      supabase.functions.invoke("unidades?acao=status_membros", { method: "GET" }),
    ]);
    setUnidades((unidadesData ?? []).sort((a, b) => compararNumero(a.numero, b.numero)));
    const agrupado = {};
    for (const m of membrosData ?? []) {
      (agrupado[m.unidade_id] ??= []).push(m);
    }
    setMembrosPorUnidade(agrupado);
    // Quem já aceitou o convite e definiu senha (last_sign_in_at preenchido
    // no Auth) — usado só pro badge "Convite pendente". Falha aqui não
    // impede o resto da tela de funcionar, só deixa de mostrar o badge.
    setAtivados(new Set(statusResp?.data?.ativados ?? []));
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

  async function alternarAdmin(m) {
    const novoValor = !m.admin;
    const mensagem = novoValor
      ? `Tornar ${m.nome} administrador(a)? Vai passar a ter acesso completo ao painel administrativo.`
      : `Remover privilégio de administrador de ${m.nome}?`;
    if (!confirm(mensagem)) return;
    setErro(null);
    setAcaoEmAndamento(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=alternar_admin", {
        body: { membro_id: m.id, admin: novoValor },
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
                    <span className="historico-item-icone" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                      </svg>
                    </span>
                    <div className="historico-item-info">
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{m.nome}</strong>
                        <MembroAdminBadge admin={m.admin} />
                        <MembroStatusBadge ativado={ativados.has(m.auth_user_id)} />
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => alternarAdmin(m)}
                        disabled={acaoEmAndamento === m.id}
                        className="icon-btn"
                        title={m.admin ? "Remover privilégio de administrador" : "Tornar administrador"}
                        aria-label={m.admin ? "Remover privilégio de administrador" : "Tornar administrador"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={m.admin ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4z" />
                        </svg>
                      </button>
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
              </div>

              <div className="row" style={{ gap: 8 }}>
                {editandoId === u.id ? (
                  <>
                    <button onClick={() => salvarEdicao(u.id)} className="btn btn-primary btn-sm">Salvar</button>
                    <button onClick={cancelarEdicao} className="btn btn-ghost btn-sm">Cancelar</button>
                  </>
                ) : (
                  <>
                    <Link
                      to={`/admin/unidades/${u.id}/membros/novo`}
                      className="icon-btn"
                      title="Adicionar morador"
                      aria-label="Adicionar morador"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="8" r="3.5" />
                        <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5" />
                        <path d="M17 8v6M14 11h6" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      onClick={() => iniciarEdicao(u)}
                      className="icon-btn"
                      title="Editar número"
                      aria-label="Editar número"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(u)}
                      className="icon-btn"
                      title={u.ativo ? "Desativar" : "Ativar"}
                      aria-label={u.ativo ? "Desativar" : "Ativar"}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v10" />
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      </svg>
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
