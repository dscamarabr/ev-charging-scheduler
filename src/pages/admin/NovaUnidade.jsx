import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-01 (Cadastrar Unidade) — tela própria (antes era um card no fim da
// lista de Unidades); RLS `unidade_insert_admin` já impede que uma
// unidade comum acesse esta função mesmo que chegasse na rota.
export default function NovaUnidade() {
  const [form, setForm] = useState({ numero: "", nome_responsavel: "", email: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const navigate = useNavigate();

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
      navigate("/admin/unidades");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Unidades", to: "/admin/unidades" }, { texto: "Nova Unidade" }]} />
      <h1 className="section">Nova Unidade</h1>

      <div className="card">
        <form onSubmit={cadastrar} className="stack">
          <div className="field">
            Número
            <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
          </div>
          <div className="field">
            Nome do responsável
            <input value={form.nome_responsavel} onChange={(e) => setForm({ ...form, nome_responsavel: e.target.value })} required />
          </div>
          <div className="field">
            E-mail
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          {erro && <p className="form-error">{erro}</p>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => navigate("/admin/unidades")} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
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
