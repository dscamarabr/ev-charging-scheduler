import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// UC-01 (Cadastrar Unidade) / UC-03 (Editar/Desativar) — requer admin = true
// A política de RLS `unidade_insert_admin` já impede que uma unidade
// comum crie outras unidades; esta tela só funciona para o síndico.
export default function AdminUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [form, setForm] = useState({ numero: "", nome_responsavel: "", email: "" });

  async function carregar() {
    const { data } = await supabase.from("unidade").select("*").order("numero");
    setUnidades(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function cadastrar(e) {
    e.preventDefault();
    // TODO: chamar uma Edge Function administrativa que:
    //   1. cria o usuário no Supabase Auth (convite por e-mail);
    //   2. insere a linha em `unidade` com o auth_user_id retornado.
    // Inserir direto na tabela não é suficiente porque auth_user_id
    // precisa vir de uma conta de autenticação já existente.
    alert("TODO: chamar Edge Function de cadastro (cria conta + linha em unidade)");
  }

  async function alternarAtivo(u) {
    await supabase.from("unidade").update({ ativo: !u.ativo }).eq("id", u.id);
    carregar();
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Unidades</h1>
      <table width="100%">
        <thead>
          <tr><th>Número</th><th>Responsável</th><th>E-mail</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {unidades.map((u) => (
            <tr key={u.id}>
              <td>{u.numero}</td>
              <td>{u.nome_responsavel}</td>
              <td>{u.email}</td>
              <td>{u.ativo ? "Ativo" : "Inativo"}</td>
              <td><button onClick={() => alternarAtivo(u)}>{u.ativo ? "Desativar" : "Ativar"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Nova Unidade</h2>
      <form onSubmit={cadastrar}>
        <input placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
        <input placeholder="Nome do responsável" value={form.nome_responsavel} onChange={(e) => setForm({ ...form, nome_responsavel: e.target.value })} required />
        <input placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <button type="submit">Salvar</button>
      </form>
    </main>
  );
}
