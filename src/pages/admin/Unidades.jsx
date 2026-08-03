import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { AtivoBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";

// UC-01 (Cadastrar Unidade) / UC-03 (Editar/Desativar) — requer admin = true
// A política de RLS `unidade_insert_admin` já impede que uma unidade
// comum crie outras unidades; esta tela só funciona para o síndico.
export default function AdminUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [form, setForm] = useState({ numero: "", nome_responsavel: "", email: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id da unidade sofrendo ação
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicao, setFormEdicao] = useState({ numero: "", nome_responsavel: "" });

  async function carregar() {
    const { data } = await supabase.from("unidade").select("*").order("numero");
    setUnidades(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function cadastrar(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=cadastrar", {
        body: form,
      });
      // supabase-js só popula `error` para falhas de rede/transporte; erros
      // de negócio (403/400) vêm no corpo da resposta, então checamos os dois.
      if (error || data?.error) {
        setErro(traduzirErro(error?.message ?? data.error));
        return;
      }
      setForm({ numero: "", nome_responsavel: "", email: "" });
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

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
        setErro(traduzirErro(error?.message ?? data.error));
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
        setErro(traduzirErro(error?.message ?? data.error));
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
      <h1 className="section">Unidades</h1>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>
        <table className="table">
          <thead>
            <tr><th style={{ padding: "12px 16px 8px" }}>Número</th><th>Responsável</th><th>E-mail</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {unidades.map((u) =>
              editandoId === u.id ? (
                <tr key={u.id}>
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      value={formEdicao.numero}
                      onChange={(e) => setFormEdicao({ ...formEdicao, numero: e.target.value })}
                      style={{ width: 70, height: 32 }}
                    />
                  </td>
                  <td>
                    <input
                      value={formEdicao.nome_responsavel}
                      onChange={(e) => setFormEdicao({ ...formEdicao, nome_responsavel: e.target.value })}
                      style={{ height: 32 }}
                    />
                  </td>
                  <td>{u.email}</td>
                  <td><AtivoBadge ativo={u.ativo} /></td>
                  <td>
                    <div className="row">
                      <button onClick={() => salvarEdicao(u.id)} className="btn btn-primary btn-sm">Salvar</button>
                      <button onClick={cancelarEdicao} className="btn btn-ghost btn-sm">Cancelar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={u.id}>
                  <td style={{ padding: "12px 16px" }}>{u.numero}</td>
                  <td>{u.nome_responsavel}</td>
                  <td>{u.email}</td>
                  <td><AtivoBadge ativo={u.ativo} /></td>
                  <td>
                    <div className="row">
                      <button onClick={() => iniciarEdicao(u)} disabled={acaoEmAndamento === u.id} className="btn btn-secondary btn-sm">
                        Editar
                      </button>
                      <button onClick={() => alternarAtivo(u)} disabled={acaoEmAndamento === u.id} className="btn btn-secondary btn-sm">
                        {u.ativo ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => reenviarConvite(u)} disabled={acaoEmAndamento === u.id} className="btn btn-secondary btn-sm">
                        Reenviar convite
                      </button>
                      <button onClick={() => excluir(u)} disabled={acaoEmAndamento === u.id} className="btn btn-danger btn-sm">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Nova Unidade</h2>
        <form onSubmit={cadastrar} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 90 }}>
            Número
            <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            Nome do responsável
            <input value={form.nome_responsavel} onChange={(e) => setForm({ ...form, nome_responsavel: e.target.value })} required />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            E-mail
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </form>
        {erro && <p className="form-error" style={{ marginTop: 12 }}>{erro}</p>}
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 16, marginBottom: 0 }}>
          Um e-mail de convite é enviado para a unidade definir a própria senha.
          Em ambiente local, veja o e-mail em{" "}
          <a href="http://localhost:54324" target="_blank" rel="noreferrer">
            http://localhost:54324
          </a>{" "}
          (Inbucket).
        </p>
      </div>
    </main>
    </>
  );
}
