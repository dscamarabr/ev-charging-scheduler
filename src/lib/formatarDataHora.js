// Formata timestamps pra exibição em pt-BR sem os segundos
// (toLocaleString("pt-BR") sozinho inclui HH:mm:ss).
export function formatarDataHora(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Só o horário — usado em listas agrupadas por dia (tela de Alertas), onde
// a data já aparece uma vez só no cabeçalho do grupo.
export function formatarHora(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Chave "YYYY-MM-DD" no fuso local — usada só pra agrupar itens do mesmo
// dia (comparação de string já ordena como data).
export function chaveDia(valor) {
  const d = new Date(valor);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "Hoje" / "Ontem" / "3 de agosto" — rótulo amigável pro cabeçalho do
// grupo de dia.
export function rotuloDia(valor) {
  const alvo = new Date(valor);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(alvo, hoje)) return "Hoje";
  if (mesmoDia(alvo, ontem)) return "Ontem";
  return alvo.toLocaleString("pt-BR", { day: "numeric", month: "long" });
}

// Agrupa uma lista de itens (com campo `enviado_em`) por dia, do mais
// recente pro mais antigo — mesmo padrão usado nas telas de Estatística.
export function agruparPorDia(lista) {
  const ordenada = [...lista].sort((a, b) => new Date(b.enviado_em) - new Date(a.enviado_em));
  const mapa = new Map();
  for (const item of ordenada) {
    const chave = chaveDia(item.enviado_em);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(item);
  }
  return [...mapa.entries()].map(([chave, itens]) => ({
    chave,
    rotulo: rotuloDia(itens[0].enviado_em),
    itens,
  }));
}
