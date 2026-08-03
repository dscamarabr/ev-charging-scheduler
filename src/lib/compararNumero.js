// `unidade.numero` é texto (aceita valores como "ADM"), então o ORDER BY
// do Postgres (ou um .sort() ingênuo) ordena por string — "100" viria
// antes de "99". Este comparador trata os valores puramente numéricos
// como número, deixando os não numéricos (ex.: "ADM") depois, em ordem
// alfabética entre si. Usado em toda tela que lista unidades (Unidades,
// Histórico, Estatística), pra manter a mesma ordem crescente em todo o
// app.
export function compararNumero(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const aEhNumero = a !== "" && !Number.isNaN(na);
  const bEhNumero = b !== "" && !Number.isNaN(nb);
  if (aEhNumero && bEhNumero) return na - nb;
  if (aEhNumero) return -1;
  if (bEhNumero) return 1;
  return a.localeCompare(b, "pt-BR");
}
