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
