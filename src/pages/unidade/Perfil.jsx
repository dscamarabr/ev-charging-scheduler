import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import NavBar from "../../components/NavBar.jsx";

// UC não numerado no scaffold original — tela de autoatendimento pra
// qualquer unidade ver/editar seus próprios dados e trocar a senha.
// Número e e-mail ficam só leitura aqui: número é identidade da unidade
// (mudança é operação administrativa) e trocar e-mail mexeria também no
// Supabase Auth (fluxo de confirmação por e-mail) — fora do escopo por ora.
export default function Perfil() {
  const [carregando, setCarregando] = useState(true);
  const [unidade, setUnidade] = useState(null);
  const [nomeResponsavel, setNomeResponsavel] = useState("");
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
        .from("unidade")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();
      setUnidade(data);
      setNomeResponsavel(data?.nome_responsavel ?? "");
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
        .from("unidade")
        .update({ nome_responsavel: nomeResponsavel })
        .eq("id", unidade.id);
      if (error) {
        setErroPerfil(error.message);
        return;
      }
      setUnidade({ ...unidade, nome_responsavel: nomeResponsavel });
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
        email: unidade.email,
        password: senhaAtual,
      });
      if (reauthError) {
        setErroSenha("Senha atual incorreta.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) {
        setErroSenha(error.message);
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
      <main style={{ maxWidth: 400, margin: "40px auto", fontFamily: "sans-serif" }}>
        <h1>Meu Perfil</h1>

        {!unidade && <p style={{ color: "crimson" }}>Não foi possível carregar os dados da unidade.</p>}

        {unidade && (
          <>
            <form onSubmit={salvarPerfil}>
              <label>
                Número da unidade
                <input value={unidade.numero} disabled />
              </label>
              <label>
                E-mail
                <input value={unidade.email} disabled />
              </label>
              <label>
                Nome do responsável
                <input
                  value={nomeResponsavel}
                  onChange={(e) => setNomeResponsavel(e.target.value)}
                  required
                />
              </label>
              {erroPerfil && <p style={{ color: "crimson" }}>{erroPerfil}</p>}
              {sucessoPerfil && <p style={{ color: "green" }}>Dados atualizados.</p>}
              <button type="submit" disabled={salvandoPerfil}>
                {salvandoPerfil ? "Salvando..." : "Salvar dados"}
              </button>
            </form>

            <h2>Trocar senha</h2>
            <form onSubmit={trocarSenha}>
              <label>
                Senha atual
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                />
              </label>
              <label>
                Nova senha
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <label>
                Confirmar nova senha
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              {erroSenha && <p style={{ color: "crimson" }}>{erroSenha}</p>}
              {sucessoSenha && <p style={{ color: "green" }}>Senha atualizada.</p>}
              <button type="submit" disabled={salvandoSenha}>
                {salvandoSenha ? "Salvando..." : "Trocar senha"}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
