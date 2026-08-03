import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { obterTelaInicial } from "../../lib/telaInicial.js";

// UC-02 — Autenticar-se no sistema (RF-02)
export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }
    navigate(await obterTelaInicial());
  }

  return (
    <main className="page page--narrow" style={{ marginTop: 64 }}>
      <div className="card">
        <img
          src="/img/grand-soleil-logo.png"
          alt="Grand Soleil"
          style={{ display: "block", width: "100%", maxWidth: 260, margin: "0 auto 20px", borderRadius: "var(--radius)" }}
        />
        <p style={{ color: "var(--color-text-secondary)", marginBottom: 20 }}>
          Agendamento de carregamento do condomínio Grand Soleil
        </p>
        <form onSubmit={handleSubmit} className="stack">
          <div className="field">
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && <p className="form-error">{erro}</p>}
          <button type="submit" className="btn btn-primary">Entrar</button>
        </form>
        <p style={{ fontSize: 13, marginTop: 20, marginBottom: 0 }}>
          Recebeu um convite do síndico? <Link to="/convite">Aceitar convite</Link>
        </p>
      </div>
    </main>
  );
}
