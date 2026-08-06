import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";
import Breadcrumb from "../../components/Breadcrumb.jsx";

// UC-05 / UC-13 (Configuração Global) — tela própria, separada de Pontos
// de Carregamento (antes vivia lá, mas era config do condomínio inteiro,
// não de um ponto específico — RN-04, RN-13).
export default function AdminConfiguracoes() {
  const [config, setConfig] = useState(null);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("configuracao_global").select("*").single();
    setConfig(data);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarConfig(e) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
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
    setSucesso(true);
    setTimeout(() => setSucesso(false), 4000);
    carregar();
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <Breadcrumb itens={[{ texto: "Admin", to: "/admin" }, { texto: "Configurações" }]} />
      <h1 className="section">Configurações</h1>

      <div className="card">
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
              <small style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                Conta reservas que já iniciaram (não as canceladas antes de começar), somando todos os pontos.
                Semana de segunda a domingo.
              </small>
            </div>
            {erro && <p className="form-error">{erro}</p>}
            {sucesso && <p className="form-success">Configuração salva com sucesso!</p>}
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
