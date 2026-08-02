// Utilitários compartilhados pelas telas de estatística mensal
// (Admin: Estatística de Reservas / Estatística de Alertas — RF-26).
//
// As telas mostram todos os meses que tiverem registro, do mais recente
// pro mais antigo — sem seletor de mês.

// Extrai a chave "YYYY-MM" de um timestamp, no fuso local do navegador
// (mesma premissa usada em CriarReserva.jsx: fuso local == fuso do
// condomínio). Comparação de string nesse formato já ordena como data.
export function chaveMes(valor) {
  const d = new Date(valor);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// "2026-08" -> "Agosto de 2026"
export function mesLabel(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  const texto = new Date(ano, mes - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
