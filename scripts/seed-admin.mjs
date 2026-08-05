// scripts/seed-admin.mjs
//
// Cria o primeiro síndico (membro_unidade com admin = true) no ambiente local.
// Substitui o passo manual descrito no README (seção "Criando o primeiro
// síndico"): cria o usuário direto no Supabase Auth via Admin API e insere
// a linha correspondente em `unidade`, numa única chamada.
//
// Uso:
//   node --env-file=.env.local scripts/seed-admin.mjs <email> <senha> <numero> "<nome responsável>"
//
// Requer no .env.local (além das VITE_* já existentes):
//   SUPABASE_URL=http://localhost:54321                (ou VITE_SUPABASE_URL, já configurada)
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key impressa por `supabase start`>
//
// A service role key NUNCA deve ir para o frontend nem ser commitada — ela
// só é lida aqui, em um script que roda localmente no seu terminal.

import { createClient } from "@supabase/supabase-js";

const [, , email, senha, numero, nomeResponsavel] = process.argv;

if (!email || !senha || !numero || !nomeResponsavel) {
  console.error(
    "Uso: node --env-file=.env.local scripts/seed-admin.mjs <email> <senha> <numero> \"<nome responsável>\"\n" +
      'Exemplo: node --env-file=.env.local scripts/seed-admin.mjs sindico@condominio.com "senhaForte123" ADM "Síndico"'
  );
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Faltando SUPABASE_URL (ou VITE_SUPABASE_URL) e/ou SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Rode `supabase start` (ou `supabase status` se já estiver rodando) para ver a " +
      "'service_role key' e adicione-a ao .env.local como SUPABASE_SERVICE_ROLE_KEY=... " +
      "(não confunda com a 'anon key', que já está em VITE_SUPABASE_ANON_KEY)."
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Criando usuário de autenticação para ${email}...`);
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // pula confirmação por e-mail (ambiente local)
    });

  if (authError) {
    throw new Error(`Falha ao criar usuário no Auth: ${authError.message}`);
  }

  const authUserId = authData.user.id;
  console.log(`Usuário criado (auth_user_id = ${authUserId}). Inserindo em 'unidade' e 'membro_unidade'...`);

  // Desde a migration 0010, "unidade" só guarda numero/ativo — quem loga
  // (e, desde a 0016, quem é admin) é `membro_unidade`.
  const { data: unidade, error: unidadeError } = await supabaseAdmin
    .from("unidade")
    .insert({ numero })
    .select()
    .single();

  if (unidadeError) {
    throw new Error(
      `Usuário criado no Auth (id ${authUserId}), mas falhou ao inserir em 'unidade': ${unidadeError.message}\n` +
        "Você pode inserir manualmente depois com esse auth_user_id."
    );
  }

  const { data: membro, error: membroError } = await supabaseAdmin
    .from("membro_unidade")
    .insert({
      unidade_id: unidade.id,
      auth_user_id: authUserId,
      nome: nomeResponsavel,
      email,
      admin: true,
    })
    .select()
    .single();

  if (membroError) {
    throw new Error(
      `Unidade criada (id ${unidade.id}), mas falhou ao inserir em 'membro_unidade': ${membroError.message}\n` +
        "Você pode inserir manualmente depois com esse auth_user_id/unidade_id."
    );
  }

  console.log("Síndico criado com sucesso:");
  console.log({ unidade, membro });
  console.log(`\nJá pode fazer login em http://localhost:5173 com ${email} / a senha informada.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
