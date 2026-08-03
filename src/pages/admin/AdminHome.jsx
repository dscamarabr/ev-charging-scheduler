import { Link } from "react-router-dom";
import NavBar from "../../components/NavBar.jsx";

// Hub da aba "Admin" da barra inferior — como essa aba não leva a uma
// única tela, mas a várias (UC-01, UC-03, UC-04, UC-05, UC-13, UC-14,
// RF-26), ela abre esta lista de atalhos em vez de navegar direto.
const SECOES = [
  {
    to: "/admin/unidades",
    titulo: "Unidades",
    descricao: "Cadastrar, editar e gerenciar acesso das unidades",
    icone: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    to: "/admin/pontos",
    titulo: "Pontos de Carregamento",
    descricao: "Gerenciar pontos e configuração global de horários",
    icone: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 L4 14h6l-1 8 9-12h-6z" />
      </svg>
    ),
  },
  {
    to: "/admin/historico",
    titulo: "Histórico",
    descricao: "Consultar reservas e alertas de atraso registrados",
    icone: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    to: "/admin/estatistica",
    titulo: "Estatística",
    descricao: "Relatório mensal de reservas e alertas por unidade",
    icone: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M12 20V4M20 20v-7" />
      </svg>
    ),
  },
];

export default function AdminHome() {
  return (
    <>
      <NavBar />
      <main className="page">
        <h1 className="section">Admin</h1>
        <div className="stack">
          {SECOES.map((s) => (
            <Link key={s.to} to={s.to} className="card admin-hub-item">
              <span className="card-header-icon" aria-hidden="true">{s.icone}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ marginBottom: 2 }}>{s.titulo}</h2>
                <p className="card-header-subtitle">{s.descricao}</p>
              </div>
              <svg className="admin-hub-item-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
