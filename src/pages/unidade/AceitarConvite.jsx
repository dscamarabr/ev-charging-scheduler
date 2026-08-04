import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { obterTelaInicial } from "../../lib/telaInicial.js";

// Completa o convite enviado por AdminUnidades (via Edge Function `unidades`,
// que chama `auth.admin.inviteUserByEmail`). O usuário criado por convite
// AINDA NÃO TEM SENHA — por isso o Login normal (email + senha) não
// funciona até essa etapa ser concluída. Duas formas de chegar aqui:
//
//  A) Clicando no link do e-mail (?type=invite&redirect_to=.../convite):
//     o Supabase Auth já estabelece uma sessão temporária via token na URL
//     antes desta página carregar (supabase-js detecta isso sozinho).
//  B) Colando o código de 6 dígitos do e-mail nesta tela (útil quando o
//     link não abre, ex. e-mail em outro dispositivo): validamos com
//     `verifyOtp({ type: "invite" })`, que também estabelece a sessão.
//
// De qualquer forma, o passo final é sempre o mesmo: com a sessão
// (temporária) já ativa, `updateUser({ password })` define a senha
// definitiva da unidade.
export default function AceitarConvite() {
  const [autenticado, setAutenticado] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Se veio pelo link do e-mail, o token chega no fragmento (#) da URL e
    // o supabase-js processa isso de forma assíncrona ao inicializar o
    // client — pode não estar pronto ainda no exato instante deste
    // primeiro getSession(). Por isso também escutamos onAuthStateChange:
    // se a sessão for estabelecida um instante depois, a tela atualiza
    // sozinha para o formulário de senha, sem exigir o código manual.
    let ativo = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!ativo) return;
      setAutenticado(!!session);
      setVerificando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!ativo) return;
      setAutenticado(!!session);
      setVerificando(false);
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  async function validarCodigo(e) {
    e.preventDefault();
    setErro(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: codigo,
      type: "invite",
    });
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }
    setAutenticado(true);
  }

  async function definirSenha(e) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirmarSenha) {
      setErro("As senhas não conferem.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }
      navigate(await obterTelaInicial());
    } finally {
      setSalvando(false);
    }
  }

  if (verificando) return null;

  return (
    <main className="page page--narrow" style={{ marginTop: 64 }}>
      <div className="card">
        <img
          src="/img/grand-soleil-logo.png"
          alt="Grand Soleil"
          style={{ display: "block", width: "100%", maxWidth: 220, margin: "0 auto 20px", borderRadius: "var(--radius)" }}
        />

        {!autenticado && (
          <>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Cole abaixo o código de 6 dígitos que veio no e-mail de convite.
            </p>
            <form onSubmit={validarCodigo} className="stack">
              <div className="field">
                E-mail
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                Código
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  inputMode="numeric"
                  required
                />
              </div>
              {erro && <p className="form-error">{erro}</p>}
              <button type="submit" className="btn btn-primary">Validar código</button>
            </form>
            <p style={{ fontSize: 13, marginTop: 20, marginBottom: 0 }}>
              <Link to="/login">← Voltar para o login</Link>
            </p>
          </>
        )}

        {autenticado && (
          <>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Convite confirmado. Defina sua senha de acesso:
            </p>
            <form onSubmit={definirSenha} className="stack">
              <div className="field">
                Nova senha
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
              </div>
              <div className="field">
                Confirmar senha
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {erro && <p className="form-error">{erro}</p>}
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Definir senha e entrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
