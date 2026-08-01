import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

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
      setErro(error.message);
      return;
    }
    navigate("/reservas/nova");
  }

  return (
    <main style={{ maxWidth: 360, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Entrar</h1>
      <form onSubmit={handleSubmit}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p style={{ color: "crimson" }}>{erro}</p>}
        <button type="submit">Entrar</button>
      </form>
      <p style={{ fontSize: 12 }}>
        Recebeu um convite do síndico? <Link to="/convite">Aceitar convite / definir senha</Link>
      </p>
    </main>
  );
}
