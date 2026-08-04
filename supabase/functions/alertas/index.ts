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
//   GET  /alertas?acao=recebidos   — alertas em que EU sou a unidade atrasada
//   GET  /alertas?acao=enviados    — alertas que EU disparei (sem revelar quem recebeu)
//   POST /alertas?acao=visualizar { alerta_id }
//
// Deploy: supabase functions deploy alertas

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Sem isso, o navegador nunca chega a mandar a requisição de verdade: como
// esta function é chamada direto do frontend (fetch em MinhasReservas.jsx e
// Alertas.jsx) com header Authorization, o navegador manda um preflight
// OPTIONS antes — sem resposta com esses headers, ele aborta com "Failed to
// fetch" (é assim que falha de CORS aparece no fetch, sem detalhe nenhum).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const unidade = await unidadeDoChamador(supabaseAsUser);
    if (!unidade) return json({ error: "Unidade não encontrada" }, 401);

    // Busca alertas cuja reserva_atrasada pertence a esta unidade,
    // devolvendo apenas os campos não identificadores (RF-20, RNF-08).
    // O `!inner` é essencial aqui: por padrão o PostgREST embeda a
    // relação como LEFT JOIN, e um .eq() num campo embedado SEM !inner
    // não filtra as linhas de `alerta` retornadas — só filtraria dentro
    // de uma relação to-many. Sem isso, TODO alerta era devolvido pra
    // QUALQUER unidade autenticada (quem enviou via "disparar" também
    // via o próprio alerta aqui, como se tivesse recebido).
    const { data: alertas } = await supabaseAdmin
      .from("alerta")
      .select("id, enviado_em, visualizado_em, reserva:reserva_atrasada_id!inner(unidade_id)")
      .eq("reserva.unidade_id", unidade.id)
      .order("enviado_em", { ascending: false });

    const sanitizados = (alertas ?? []).map((a: any) => ({
      id: a.id,
      enviado_em: a.enviado_em,
      visualizado_em: a.visualizado_em,
      // unidade_solicitante_id NUNCA é incluído na resposta
    }));
    return json({ alertas: sanitizados });
  }

  if (acao === "enviados" && req.method === "GET") {
    const unidade = await unidadeDoChamador(supabaseAsUser);
    if (!unidade) return json({ error: "Unidade não encontrada" }, 401);

    // Alertas que ESTA unidade disparou. Aqui o filtro é numa coluna
    // direta de `alerta` (unidade_solicitante_id), não numa relação
    // embedada, então não precisa de !inner. Só devolvemos se foi
    // visto ou não — nunca de quem era a reserva atrasada (RF-20).
    const { data: alertas } = await supabaseAdmin
      .from("alerta")
      .select("id, enviado_em, visualizado_em")
      .eq("unidade_solicitante_id", unidade.id)
      .order("enviado_em", { ascending: false });

    return json({ alertas: alertas ?? [] });
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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Desde a migration 0010, quem loga é um `membro_unidade` — a unidade em
// si (dona da reserva/dos alertas) é `membro.unidade_id`. Mantém a mesma
// forma de retorno { id } de antes pra não precisar mexer no resto do
// arquivo, que só usa `unidade.id`.
async function unidadeDoChamador(
  supabaseAsUser: ReturnType<typeof createClient>
): Promise<{ id: string } | null> {
  const { data: userData } = await supabaseAsUser.auth.getUser();
  const { data: membro } = await supabaseAsUser
    .from("membro_unidade")
    .select("unidade_id")
    .eq("auth_user_id", userData.user?.id)
    .single();
  return membro ? { id: membro.unidade_id } : null;
}
