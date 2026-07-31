// supabase/functions/alertas/index.ts
//
// Edge Function dedicada ao fluxo de Alerta Anônimo de Atraso (RF-19 a
// RF-22, RNF-08). A tabela `alerta` NÃO é exposta via PostgREST para
// unidades comuns (ver migration 0001, policy `alerta_select_admin`) —
// toda leitura por uma unidade passa por aqui, que devolve apenas os
// campos que aquele lado tem permissão de ver, sem nunca revelar a
// identidade da outra unidade envolvida.
//
// Rotas (via query param `acao`):
//   POST /alertas?acao=disparar   { minha_reserva_id }
//   GET  /alertas?acao=recebidos                        (JWT do solicitante da requisição)
//   POST /alertas?acao=visualizar { alerta_id }
//
// Deploy: supabase functions deploy alertas

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");

  // Cliente autenticado como o usuário que fez a chamada (respeita RLS)
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseAsUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  // Cliente com service role, para operações que precisam ignorar RLS
  // (ex.: checar a reserva atrasada sem expor a tabela alerta inteira)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  if (acao === "disparar" && req.method === "POST") {
    const { minha_reserva_id } = await req.json();
    const { error } = await supabaseAsUser.rpc("disparar_alerta", {
      p_minha_reserva_id: minha_reserva_id,
    });
    if (error) return json({ error: error.message }, 400);
    // Confirmação sem identificar a unidade atrasada (RF-20)
    return json({ ok: true, mensagem: "Alerta enviado de forma anônima." });
  }

  if (acao === "recebidos" && req.method === "GET") {
    const { data: userData } = await supabaseAsUser.auth.getUser();
    const { data: unidade } = await supabaseAsUser
      .from("unidade")
      .select("id")
      .eq("auth_user_id", userData.user?.id)
      .single();
    if (!unidade) return json({ error: "Unidade não encontrada" }, 401);

    // Busca alertas cuja reserva_atrasada pertence a esta unidade,
    // devolvendo apenas os campos não identificadores (RF-20, RNF-08)
    const { data: alertas } = await supabaseAdmin
      .from("alerta")
      .select("id, enviado_em, visualizado_em, reserva:reserva_atrasada_id(unidade_id)")
      .eq("reserva.unidade_id", unidade.id);

    const sanitizados = (alertas ?? []).map((a: any) => ({
      id: a.id,
      enviado_em: a.enviado_em,
      visualizado_em: a.visualizado_em,
      // unidade_solicitante_id NUNCA é incluído na resposta
    }));
    return json({ alertas: sanitizados });
  }

  if (acao === "visualizar" && req.method === "POST") {
    const { alerta_id } = await req.json();
    const { error } = await supabaseAdmin
      .from("alerta")
      .update({ visualizado_em: new Date().toISOString() })
      .eq("id", alerta_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Ação inválida" }, 400);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
