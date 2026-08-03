// Badge visual para status de reserva/unidade — cor de status fica
// separada da cor de marca (tema "Acolhedor"), pra não confundir
// "situação da reserva" com identidade visual do app.
const MAPA_RESERVA = {
  confirmada: { classe: "badge-info", texto: "Confirmada" },
  em_andamento: { classe: "badge-warning", texto: "Em andamento" },
  concluida: { classe: "badge-success", texto: "Concluída" },
  cancelada: { classe: "badge-neutral", texto: "Cancelada" },
};

export function StatusBadge({ status }) {
  const info = MAPA_RESERVA[status] ?? { classe: "badge-neutral", texto: status };
  return <span className={`badge ${info.classe}`}>{info.texto}</span>;
}

export function AtivoBadge({ ativo }) {
  return (
    <span className={`badge ${ativo ? "badge-success" : "badge-neutral"}`}>
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}
