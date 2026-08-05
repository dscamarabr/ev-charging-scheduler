import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro, extrairErroFuncao } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// Convida mais um morador (membro_unidade) pra uma unidade que já existe —
// migration 0010: uma unidade pode ter N membros, todos compartilhando a
// mesma reserva/vaga (RN-01 é por unidade_id). Mesmo padrão de "cadastro
// em rota própria" de NovaUnidade.jsx, só que aqui a unidade já existe
// (vem da URL) em vez de ser criada.
export default function AdicionarMorador() {
  const { unidadeId } = useParams();
  const [unidade, setUnidade] = useState(null);
  const [form, setForm] = useState({ nome: "", email: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("unidade")
      .select("id, numero")
      .eq("id", unidadeId)
      .single()
      .then(({ data }) => setUnidade(data));
  }, [unidadeId]);

  async function adicionar(e) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=adicionar_membro", {
        body: { unidade_id: unidadeId, ...form },
      });
      if (error || data?.error) {
        setErro(traduzirErro(await extrairErroFuncao(error, data)));
        return;
      }
      // Mostra a confirmação por um instante antes de sair da tela — sem
      // isso, o síndico nunca via nenhum feedback de que o e-mail de
      // convite realmente foi disparado.
      setSucesso(true);
      setTimeout(() => navigate("/admin/unidades"), 1200);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Unidades", to: "/admin/unidades" }, { texto: "Adicionar Morador" }]} />
      {/* Título curto e fixo — o número da unidade vira subtítulo em vez de
          ser concatenado no h1, que quebrava linha no meio em telas
          estreitas de celular (única tela do projeto que grudava um sufixo
          dinâmico direto no título). */}
      <h1 className="section" style={{ marginBottom: unidade ? 4 : 32 }}>Adicionar Morador</h1>
      {unidade && (
        <p className="card-header-subtitle" style={{ marginBottom: 20 }}>Unidade {unidade.numero}</p>
      )}

      <div className="card">
        <form onSubmit={adicionar} className="stack">
          <div className="field">
            Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div className="field">
            E-mail
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          {erro && <p className="form-error">{erro}</p>}
          {sucesso && <p className="form-success">Email enviado com sucesso!</p>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={salvando || sucesso}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => navigate("/admin/unidades")} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
    </>
  );
}
