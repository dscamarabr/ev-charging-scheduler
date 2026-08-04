// supabase/functions/unidades/index.ts
//
// Edge Function administrativa para o ciclo de vida de unidades e seus
// membros (UC-01, UC-03, RF-01). Desde a migration 0010, uma unidade pode
// ter N membros (contas/logins) — todos compartilham a mesma reserva da
// unidade (RN-01 é por unidade_id, não por pessoa). Inserir direto nas
// tabelas não é suficiente porque `auth_user_id` precisa vir de uma conta
// já existente no Supabase Auth (e excluir/reenviar precisam do Admin API
// do Auth) — então esta função:
//   1. verifica que quem está chamando é o síndico (unidade com admin = true);
//   2. cria o usuário no Supabase Auth via convite por e-mail
//      (auth.admin.inviteUserByEmail — o usuário define a própria senha
//      pelo link recebido);
//   3. insere/remove a linha correspondente em `membro_unidade` (e, no
//      caso de `cadastrar`, a unidade em si).
//
// Rotas (via query param `acao`):
//   POST /unidades?acao=cadastrar        { numero, nome, email }              — cria unidade nova + 1º membro
//   POST /unidades?acao=adicionar_membro { unidade_id, nome, email }          — convida +1 morador pra unidade já existente
//   POST /unidades?acao=reenviar         { membro_id }                        — reenvia convite (só se ainda não definiu senha)
//   POST /unidades?acao=excluir          { membro_id }                        — remove um morador (não o último da unidade)
//
// Deploy: supabase functions deploy unidades

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// URL do frontend, para o link do e-mail de convite já cair na tela de
// aceitar convite (/convite) em vez da raiz do site.
// Configurar em produção com: supabase secrets set SITE_URL=https://seu-dominio.com
const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// As mensagens acima (nossas) já estão em português, mas os erros que
// vêm do Auth Admin API e do Postgres (authError/membroError/deleteError
// abaixo) chegam em inglês — traduzimos os casos mais comuns antes de
// interpolar no texto exibido pro síndico. Mesma lista de src/lib/traduzirErro.js
// (mantida em duplicado aqui porque a Edge Function roda em runtime Deno
// separado do bundle do frontend).
function traduzirErroAuth(mensagem: string | undefined): string {
  if (!mensagem) return "Erro desconhecido";
  const chave = mensagem.trim().toLowerCase();
  const mapa: Record<string, string> = {
    "user already registered": "Este e-mail já está cadastrado no sistema de autenticação.",
    "unable to validate email address: invalid format": "E-mail em formato inválido.",
    "email rate limit exceeded": "Limite de envio de e-mails excedido. Tente novamente mais tarde.",
    "user not found": "Usuário não encontrado.",
  };
  if (mapa[chave]) return mapa[chave];
  if (/duplicate key value violates unique constraint/i.test(mensagem)) {
    return "Já existe um cadastro com esse número ou e-mail.";
  }
  if (/for security purposes, you can only request this after/i.test(mensagem)) {
    return "Por segurança, aguarde alguns instantes antes de tentar novamente.";
  }
  return mensagem;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");

  // Cliente autenticado como quem chamou (para checar is_admin() via RLS/RPC)
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseAsUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  // Cliente com service role — único capaz de criar usuários no Auth e
  // inserir em `unidade`/`membro_unidade` sem esbarrar nas policies (que
  // já reforçam a mesma regra, mas checamos aqui antes pra dar uma
  // mensagem de erro clara em vez de um erro cru de RLS).
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  if (acao === "cadastrar" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode cadastrar unidades." }, 403);
    }

    const { numero, nome, email } = await req.json();
    if (!numero || !nome || !email) {
      return json({ error: "numero, nome e email são obrigatórios." }, 400);
    }

    const { data: unidade, error: unidadeError } = await supabaseAdmin
      .from("unidade")
      .insert({ numero })
      .select()
      .single();
    if (unidadeError) {
      return json({ error: `Falha ao cadastrar unidade: ${traduzirErroAuth(unidadeError.message)}` }, 400);
    }

    const { data: convite, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/convite`,
    });
    if (authError) {
      // Sem membro ainda, mas a unidade já foi criada — desfaz pra não
      // deixar unidade "fantasma" sem morador nenhum.
      await supabaseAdmin.from("unidade").delete().eq("id", unidade.id);
      return json({ error: `Falha ao convidar usuário: ${traduzirErroAuth(authError.message)}` }, 400);
    }

    const { data: membro, error: membroError } = await supabaseAdmin
      .from("membro_unidade")
      .insert({ unidade_id: unidade.id, auth_user_id: convite.user.id, nome, email })
      .select()
      .single();
    if (membroError) {
      // Rollback: sem o usuário órfão no Auth nem a unidade sem morador
      await supabaseAdmin.auth.admin.deleteUser(convite.user.id);
      await supabaseAdmin.from("unidade").delete().eq("id", unidade.id);
      return json({ error: `Falha ao cadastrar morador: ${traduzirErroAuth(membroError.message)}` }, 400);
    }

    return json({ ok: true, unidade, membro });
  }

  if (acao === "adicionar_membro" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode adicionar moradores." }, 403);
    }

    const { unidade_id, nome, email } = await req.json();
    if (!unidade_id || !nome || !email) {
      return json({ error: "unidade_id, nome e email são obrigatórios." }, 400);
    }

    const { data: unidade, error: buscaError } = await supabaseAdmin
      .from("unidade")
      .select("id")
      .eq("id", unidade_id)
      .single();
    if (buscaError || !unidade) {
      return json({ error: "Unidade não encontrada." }, 404);
    }

    const { data: convite, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/convite`,
    });
    if (authError) {
      return json({ error: `Falha ao convidar usuário: ${traduzirErroAuth(authError.message)}` }, 400);
    }

    const { data: membro, error: membroError } = await supabaseAdmin
      .from("membro_unidade")
      .insert({ unidade_id, auth_user_id: convite.user.id, nome, email })
      .select()
      .single();
    if (membroError) {
      await supabaseAdmin.auth.admin.deleteUser(convite.user.id);
      return json({ error: `Falha ao cadastrar morador: ${traduzirErroAuth(membroError.message)}` }, 400);
    }

    return json({ ok: true, membro });
  }

  if (acao === "reenviar" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode reenviar convites." }, 403);
    }

    const { membro_id } = await req.json();
    const { data: membro, error: buscaError } = await supabaseAdmin
      .from("membro_unidade")
      .select("unidade_id, nome, email, auth_user_id")
      .eq("id", membro_id)
      .single();
    if (buscaError || !membro) {
      return json({ error: "Morador não encontrado." }, 404);
    }

    // Reenviar só faz sentido se essa conta ainda não definiu senha (ainda
    // não logou de verdade). Não precisa mais checar histórico de reservas/
    // alertas: como membro_unidade não é mais referenciado por reserva
    // nem alerta (ambos apontam pra unidade_id, que não muda aqui), apagar
    // e recriar o membro não afeta o histórico da unidade.
    const jaTemSenha = await unidadeJaAtivou(supabaseAdmin, membro.auth_user_id);
    if (jaTemSenha) {
      return json(
        { error: "Este morador já ativou a conta (já definiu senha) — não é possível reenviar convite." },
        409
      );
    }

    // O e-mail em auth.users é único: pra gerar um token novo, a conta
    // pendente precisa ser apagada antes de reconvidar. Isso cascade-apaga
    // a linha em `membro_unidade` (FK auth_user_id), por isso recriamos a
    // linha logo em seguida com os mesmos dados.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(membro.auth_user_id);
    if (deleteError) {
      return json({ error: `Falha ao invalidar convite anterior: ${traduzirErroAuth(deleteError.message)}` }, 400);
    }

    const { data: convite, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(membro.email, {
      redirectTo: `${siteUrl}/convite`,
    });
    if (authError) {
      return json({ error: `Falha ao reenviar convite: ${traduzirErroAuth(authError.message)}` }, 400);
    }

    const { data: membroNovo, error: membroError } = await supabaseAdmin
      .from("membro_unidade")
      .insert({ unidade_id: membro.unidade_id, auth_user_id: convite.user.id, nome: membro.nome, email: membro.email })
      .select()
      .single();
    if (membroError) {
      return json({ error: `Convite reenviado, mas falhou ao recriar o cadastro: ${traduzirErroAuth(membroError.message)}` }, 400);
    }

    return json({ ok: true, membro: membroNovo });
  }

  if (acao === "excluir" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode remover moradores." }, 403);
    }

    const { membro_id } = await req.json();
    const { data: membro, error: buscaError } = await supabaseAdmin
      .from("membro_unidade")
      .select("unidade_id, auth_user_id")
      .eq("id", membro_id)
      .single();
    if (buscaError || !membro) {
      return json({ error: "Morador não encontrado." }, 404);
    }

    const { count: totalMembros } = await supabaseAdmin
      .from("membro_unidade")
      .select("id", { count: "exact", head: true })
      .eq("unidade_id", membro.unidade_id);
    if ((totalMembros ?? 0) <= 1) {
      return json(
        { error: "Não é possível remover o único morador da unidade — desative a unidade em vez disso." },
        409
      );
    }

    // Apagar o usuário do Auth cascade-apaga a linha em `membro_unidade`
    // (FK auth_user_id ... on delete cascade). Não mexe em `unidade` nem
    // no histórico de reservas/alertas (esses são por unidade_id).
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(membro.auth_user_id);
    if (deleteError) {
      return json({ error: `Falha ao remover: ${traduzirErroAuth(deleteError.message)}` }, 400);
    }

    return json({ ok: true });
  }

  return json({ error: "Ação inválida" }, 400);
});

// Uma conta "já ativou" quando o usuário do Auth tem `last_sign_in_at`
// preenchido (definiu a própria senha via /convite e pelo menos entrou
// uma vez) — usado só pra decidir se `reenviar` faz sentido.
async function unidadeJaAtivou(
  supabaseAdmin: ReturnType<typeof createClient>,
  authUserId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error || !data?.user) return false;
  return !!data.user.last_sign_in_at;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
