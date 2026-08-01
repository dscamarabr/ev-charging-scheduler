// supabase/functions/unidades/index.ts
//
// Edge Function administrativa para o ciclo de vida de unidades (UC-01,
// UC-03, RF-01). Inserir direto na tabela `unidade` não é suficiente porque
// `auth_user_id` precisa vir de uma conta já existente no Supabase Auth (e
// excluir/reenviar precisam do Admin API do Auth) — então esta função:
//   1. verifica que quem está chamando é o síndico (unidade com admin = true);
//   2. cria o usuário no Supabase Auth via convite por e-mail
//      (auth.admin.inviteUserByEmail — o usuário define a própria senha
//      pelo link recebido; em dev local, o e-mail cai no Inbucket,
//      http://localhost:54324);
//   3. insere/remove a linha correspondente em `unidade`.
//
// Rotas (via query param `acao`):
//   POST /unidades?acao=cadastrar { numero, nome_responsavel, email }
//   POST /unidades?acao=reenviar  { unidade_id }
//   POST /unidades?acao=excluir   { unidade_id }
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
  // inserir em `unidade` sem esbarrar na policy `unidade_insert_admin`
  // (que já reforça a mesma regra, mas checamos aqui antes de usar o
  // service role para dar uma mensagem de erro clara).
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  if (acao === "cadastrar" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode cadastrar unidades." }, 403);
    }

    const { numero, nome_responsavel, email } = await req.json();
    if (!numero || !nome_responsavel || !email) {
      return json({ error: "numero, nome_responsavel e email são obrigatórios." }, 400);
    }

    const { data: convite, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/convite`,
    });
    if (authError) {
      return json({ error: `Falha ao convidar usuário: ${authError.message}` }, 400);
    }

    const { data: unidade, error: unidadeError } = await supabaseAdmin
      .from("unidade")
      .insert({
        numero,
        nome_responsavel,
        email,
        auth_user_id: convite.user.id,
        admin: false,
      })
      .select()
      .single();

    if (unidadeError) {
      // Rollback: sem o usuário órfão no Auth, ele não teria como logar mesmo assim
      await supabaseAdmin.auth.admin.deleteUser(convite.user.id);
      return json({ error: `Falha ao cadastrar unidade: ${unidadeError.message}` }, 400);
    }

    return json({ ok: true, unidade });
  }

  if (acao === "reenviar" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode reenviar convites." }, 403);
    }

    const { unidade_id } = await req.json();
    const { data: unidade, error: buscaError } = await supabaseAdmin
      .from("unidade")
      .select("numero, nome_responsavel, email, admin, auth_user_id")
      .eq("id", unidade_id)
      .single();
    if (buscaError || !unidade) {
      return json({ error: "Unidade não encontrada." }, 404);
    }

    const semHistorico = await verificarSemHistorico(supabaseAdmin, unidade_id);
    if (!semHistorico) {
      return json(
        { error: "Esta unidade já tem reservas/alertas registrados — não é possível reenviar convite (ela já ativou a conta em algum momento)." },
        409
      );
    }

    // O e-mail em auth.users é único: para gerar um token novo, a conta
    // pendente (ainda sem senha) precisa ser apagada antes de reconvidar.
    // Isso cascade-apaga a linha antiga em `unidade` (FK auth_user_id),
    // por isso recriamos a linha logo em seguida com os mesmos dados.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(unidade.auth_user_id);
    if (deleteError) {
      return json({ error: `Falha ao invalidar convite anterior: ${deleteError.message}` }, 400);
    }

    const { data: convite, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(unidade.email, {
      redirectTo: `${siteUrl}/convite`,
    });
    if (authError) {
      return json({ error: `Falha ao reenviar convite: ${authError.message}` }, 400);
    }

    const { data: unidadeNova, error: unidadeError } = await supabaseAdmin
      .from("unidade")
      .insert({
        numero: unidade.numero,
        nome_responsavel: unidade.nome_responsavel,
        email: unidade.email,
        auth_user_id: convite.user.id,
        admin: unidade.admin,
      })
      .select()
      .single();
    if (unidadeError) {
      return json({ error: `Convite reenviado, mas falhou ao recriar a unidade: ${unidadeError.message}` }, 400);
    }

    return json({ ok: true, unidade: unidadeNova });
  }

  if (acao === "excluir" && req.method === "POST") {
    const { data: isAdmin, error: adminError } = await supabaseAsUser.rpc("is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Apenas o síndico pode excluir unidades." }, 403);
    }

    const { unidade_id } = await req.json();
    const { data: unidade, error: buscaError } = await supabaseAdmin
      .from("unidade")
      .select("auth_user_id")
      .eq("id", unidade_id)
      .single();
    if (buscaError || !unidade) {
      return json({ error: "Unidade não encontrada." }, 404);
    }

    const semHistorico = await verificarSemHistorico(supabaseAdmin, unidade_id);
    if (!semHistorico) {
      return json(
        { error: "Esta unidade já tem reservas/alertas no histórico — exclua depois de arquivar esses dados, ou apenas desative a unidade em vez de excluir." },
        409
      );
    }

    // Apagar o usuário do Auth cascade-apaga a linha em `unidade`
    // (FK auth_user_id ... on delete cascade) e as push_subscription dela.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(unidade.auth_user_id);
    if (deleteError) {
      return json({ error: `Falha ao excluir: ${deleteError.message}` }, 400);
    }

    return json({ ok: true });
  }

  return json({ error: "Ação inválida" }, 400);
});

// Uma unidade só pode ser excluída ou ter seu convite reenviado (o que também
// destrói e recria a linha) se nunca tiver gerado reserva ou alerta — do
// contrário perderíamos histórico administrativo (RF-26, RF-27).
async function verificarSemHistorico(
  supabaseAdmin: ReturnType<typeof createClient>,
  unidadeId: string
): Promise<boolean> {
  const { count: totalReservas } = await supabaseAdmin
    .from("reserva")
    .select("id", { count: "exact", head: true })
    .eq("unidade_id", unidadeId);
  const { count: totalAlertas } = await supabaseAdmin
    .from("alerta")
    .select("id", { count: "exact", head: true })
    .eq("unidade_solicitante_id", unidadeId);
  return (totalReservas ?? 0) === 0 && (totalAlertas ?? 0) === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
