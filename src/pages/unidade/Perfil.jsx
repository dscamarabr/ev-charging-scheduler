import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import NavBar from "../../components/NavBar.jsx";

// UC não numerado no scaffold original — tela de autoatendimento pra
// qualquer morador ver/editar os próprios dados e trocar a senha.
//
// Desde a migration 0010, quem loga é um `membro_unidade` (pode haver mais
// de um por unidade, ex.: casal) — o número da unidade continua só
// leitura aqui (é identidade da unidade, mudança é operação
// administrativa) e o e-mail também (trocar e-mail mexeria no Supabase
// Auth, fora do escopo por ora). O nome agora é do PRÓPRIO membro, não
// mais "o responsável da unidade" — cada um edita só o seu.
export default function Perfil() {
  const [carregando, setCarregando] = useState(true);
  const [membro, setMembro] = useState(null);
  const [numeroUnidade, setNumeroUnidade] = useState("");
  const [nome, setNome] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [erroPerfil, setErroPerfil] = useState(null);
  const [sucessoPerfil, setSucessoPerfil] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState(null);
  const [sucessoSenha, setSucessoSenha] = useState(false);

  useEffect(() => {
    async function carregar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("membro_unidade")
        .select("*, unidade(numero)")
        .eq("auth_user_id", user.id)
        .single();
      setMembro(data);
      setNome(data?.nome ?? "");
      setNumeroUnidade(data?.unidade?.numero ?? "");
      setCarregando(false);
    }
    carregar();
  }, []);

  async function salvarPerfil(e) {
    e.preventDefault();
    setErroPerfil(null);
    setSucessoPerfil(false);
    setSalvandoPerfil(true);
    try {
      const { error } = await supabase
        .from("membro_unidade")
        .update({ nome })
        .eq("id", membro.id);
      if (error) {
        setErroPerfil(traduzirErro(error.message));
        return;
      }
      setMembro({ ...membro, nome });
      setSucessoPerfil(true);
    } finally {
      setSalvandoPerfil(false);
    }
  }

  async function trocarSenha(e) {
    e.preventDefault();
    setErroSenha(null);
    setSucessoSenha(false);

    if (novaSenha !== confirmarSenha) {
      setErroSenha("As senhas não conferem.");
      return;
    }
    if (novaSenha.length < 6) {
      setErroSenha("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setSalvandoSenha(true);
    try {
      // Confirma que quem está na tela realmente sabe a senha atual antes de
      // trocar — evita que uma sessão esquecida aberta troque a senha sem
      // reautenticar (Supabase não exige a senha antiga por padrão).
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: membro.email,
        password: senhaAtual,
      });
      if (reauthError) {
        setErroSenha("Senha atual incorreta.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) {
        setErroSenha(traduzirErro(error.message));
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      setSucessoSenha(true);
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (carregando) return null;

  return (
    <>
      <NavBar />
      <main className="page page--narrow">
        <h1 className="section">Meu Perfil</h1>

        {!membro && <p className="form-error">Não foi possível carregar seus dados.</p>}

        {membro && (
          <div className="stack" style={{ gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-header-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11l9-7 9 7" />
                    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
                  </svg>
                </span>
                <div>
                  <h2>Meus dados</h2>
                  <p className="card-header-subtitle">Sua unidade e seus dados de contato</p>
                </div>
              </div>
              <form onSubmit={salvarPerfil} className="stack">
                <div className="field">
                  Número da unidade
                  <input value={numeroUnidade} disabled />
                </div>
                <div className="field">
                  E-mail
                  <input value={membro.email} disabled />
                </div>
                <div className="field">
                  Nome
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>
                {erroPerfil && <p className="form-error">{erroPerfil}</p>}
                {sucessoPerfil && <p className="form-success">Dados atualizados.</p>}
                <button type="submit" className="btn btn-primary" disabled={salvandoPerfil}>
                  {salvandoPerfil ? "Salvando..." : "Salvar dados"}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-header-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <div>
                  <h2>Trocar senha</h2>
                  <p className="card-header-subtitle">Defina uma nova senha de acesso</p>
                </div>
              </div>
              <form onSubmit={trocarSenha} className="stack">
                <div className="field">
                  Senha atual
                  <input
                    type="password"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  Nova senha
                  <input
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="field">
                  Confirmar nova senha
                  <input
                    type="password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                {erroSenha && <p className="form-error">{erroSenha}</p>}
                {sucessoSenha && <p className="form-success">Senha atualizada.</p>}
                <button type="submit" className="btn btn-primary" disabled={salvandoSenha}>
                  {salvandoSenha ? "Salvando..." : "Trocar senha"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
