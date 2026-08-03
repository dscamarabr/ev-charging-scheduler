import { Link } from "react-router-dom";

// Trilha de navegação usada no topo das telas administrativas — todas são
// acessadas a partir do hub /admin, então sempre aparece pelo menos esse
// link. `itens` é uma lista de { texto, to? }; o último item (tela atual)
// deve vir sem `to`, os demais são clicáveis.
export default function Breadcrumb({ itens }) {
  return (
    <nav className="breadcrumb" aria-label="Navegação administrativa">
      {itens.map((item, i) => (
        <span key={i} className="breadcrumb-item">
          {item.to ? <Link to={item.to}>{item.texto}</Link> : <span>{item.texto}</span>}
          {i < itens.length - 1 && <span className="breadcrumb-separador">/</span>}
        </span>
      ))}
    </nav>
  );
}
