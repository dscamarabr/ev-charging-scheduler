import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-04 (Gerenciar Pontos) — tela própria de cadastro (antes era um card
// no fim da lista de Pontos, mesmo padrão já corrigido em Unidades).
export default function NovoPonto() {
  const [form, setForm] = useState({ nome: "", duracao_maxima_minutos: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const navigate = useNavigate();

  async function cadastrar(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const { error } = await supabase.from("ponto_carregamento").insert({
        nome: form.nome,
        duracao_maxima_minutos: Number(form.duracao_maxima_minutos),
      });
      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }
      navigate("/admin/pontos");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Pontos de Carregamento", to: "/admin/pontos" }, { texto: "Novo Ponto" }]} />
      <h1 className="section">Novo Ponto de Carregamento</h1>

      <div className="card">
        <form onSubmit={cadastrar} className="stack">
          <div className="field">
            Nome
            <input
              placeholder="Pilotis, Garagem..."
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
          </div>
          <div className="field">
            Duração máx. diurna (min)
            <input
              type="number"
              min="1"
              value={form.duracao_maxima_minutos}
              onChange={(e) => setForm({ ...form, duracao_maxima_minutos: e.target.value })}
              required
            />
          </div>
          {erro && <p className="form-error">{erro}</p>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => navigate("/admin/pontos")} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
    </>
  );
}
