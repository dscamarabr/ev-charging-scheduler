// Traduz mensagens de erro que chegam em inglês (SDK de Auth do Supabase,
// Postgres/PostgREST, erros de rede do navegador) pra um texto em
// português que faça sentido pra unidade/síndico. Mensagens que já vêm
// em português (nossas RPCs e Edge Functions) passam batido, sem troca.
//
// Ordem de checagem: (1) mapa de mensagens exatas conhecidas do GoTrue
// (Auth), (2) padrões de erro do Postgres/PostgREST, (3) erros de rede
// do navegador. Se nada bater, devolve a mensagem original — melhor
// mostrar o texto em inglês do que esconder um erro real não catalogado.
const MENSAGENS_AUTH = {
  "invalid login credentials": "E-mail ou senha inválidos.",
  "email not confirmed": "E-mail ainda não confirmado.",
  "user already registered": "Este e-mail já está cadastrado.",
  "password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres.",
  "password should be at least 6 characters.": "A senha deve ter pelo menos 6 caracteres.",
  "new password should be different from the old password": "A nova senha deve ser diferente da senha atual.",
  "token has expired or is invalid": "Código expirado ou inválido. Peça pro síndico reenviar o convite.",
  "email link is invalid or has expired": "Link expirado ou inválido. Peça pro síndico reenviar o convite.",
  "invalid refresh token: already used": "Sessão expirada. Faça login novamente.",
  "auth session missing!": "Sessão expirada. Faça login novamente.",
  "user not found": "Usuário não encontrado.",
  "unable to validate email address: invalid format": "E-mail em formato inválido.",
  "signup requires a valid password": "A senha informada é inválida.",
  "email rate limit exceeded": "Limite de envio de e-mails excedido. Tente novamente mais tarde.",
  "over_email_send_rate_limit": "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
};

const PADROES_POSTGRES = [
  { regex: /duplicate key value violates unique constraint/i, texto: "Já existe um registro com esses dados." },
  { regex: /violates foreign key constraint/i, texto: "Não é possível concluir: existem registros vinculados a este item." },
  { regex: /violates not-null constraint/i, texto: "Preencha todos os campos obrigatórios." },
  { regex: /new row violates row-level security policy/i, texto: "Você não tem permissão para realizar esta ação." },
  { regex: /JSON object requested, multiple \(or no\) rows returned/i, texto: "Registro não encontrado." },
];

const PADROES_REDE = [
  { regex: /^failed to fetch$/i, texto: "Falha na conexão. Verifique sua internet e tente novamente." },
  { regex: /networkerror when attempting to fetch resource/i, texto: "Falha na conexão. Verifique sua internet e tente novamente." },
  { regex: /^load failed$/i, texto: "Falha na conexão. Verifique sua internet e tente novamente." },
];

// supabase-js sempre preenche `error.message` com o texto genérico "Edge
// Function returned a non-2xx status code" quando a function responde com
// status de erro (400, 403, 409...) — a mensagem real que a própria Edge
// Function devolveu (nosso JSON { error: "..." }) fica só no corpo da
// resposta, acessível via `error.context` (um objeto Response). Sem isso,
// toda falha de negócio (permissão, duplicidade, limite de e-mail etc.)
// aparecia pro usuário só como esse texto genérico em inglês.
export async function extrairErroFuncao(error, data) {
  if (data?.error) return data.error;
  if (!error) return null;
  if (error.context && typeof error.context.json === "function") {
    try {
      const corpo = await error.context.clone().json();
      if (corpo?.error) return corpo.error;
    } catch {
      // corpo não era JSON (ex.: erro de rede/gateway) — cai no fallback abaixo
    }
  }
  return error.message;
}

export function traduzirErro(mensagem) {
  if (!mensagem) return mensagem;

  const chave = mensagem.trim().toLowerCase();
  if (MENSAGENS_AUTH[chave]) return MENSAGENS_AUTH[chave];

  for (const { regex, texto } of [...PADROES_POSTGRES, ...PADROES_REDE]) {
    if (regex.test(mensagem)) return texto;
  }

  // Ex.: "For security purposes, you can only request this after 34 seconds."
  if (/for security purposes, you can only request this after/i.test(mensagem)) {
    return "Por segurança, aguarde alguns instantes antes de tentar novamente.";
  }

  return mensagem;
}
