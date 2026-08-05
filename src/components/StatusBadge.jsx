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
    <span className={`badge ${ativo ? "badge-success" : "badge-danger"}`}>
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

// Indica se um MORADOR (não a unidade) já aceitou o convite e definiu
// senha — ver Unidades.jsx e unidades/index.ts (ação status_membros).
// Só aparece pra quem ainda está pendente: o caso comum (já ativou) não
// precisa de destaque nenhum, e "Pendente" em âmbar evita confundir com
// o vermelho já usado pra "Inativo" (situação da unidade, não da pessoa).
export function MembroStatusBadge({ ativado }) {
  if (ativado) return null;
  return <span className="badge badge-warning">Convite pendente</span>;
}
