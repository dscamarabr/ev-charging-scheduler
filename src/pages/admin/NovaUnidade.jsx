import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro, extrairErroFuncao } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-01 (Cadastrar Unidade) — tela própria (antes era um card no fim da
// lista de Unidades); RLS `unidade_insert_admin` já impede que uma
// unidade comum acesse esta função mesmo que chegasse na rota.
export default function NovaUnidade() {
  const [form, setForm] = useState({ numero: "", nome: "", email: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const navigate = useNavigate();

  async function cadastrar(e) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke("unidades?acao=cadastrar", {
        body: form,
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
