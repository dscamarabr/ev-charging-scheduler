import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";

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
    navigate("/reservas/nova");
  }

  return (
    <main className="page page--narrow" style={{ marginTop: 64 }}>
      <div className="card">
        <h1>Entrar</h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: 20 }}>
          Agendamento de carregamento do condomínio
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
          Recebeu um convite do síndico? <Link to="/convite">Aceitar convite / definir senha</Link>
        </p>
      </div>
    </main>
  );
}
