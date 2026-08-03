import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Navegação simples compartilhada entre as telas de unidade e do síndico.
// Os links de admin só aparecem para quem tem `unidade.admin = true`
// (checado via RPC `is_admin()`, a mesma usada pelas policies de RLS).
export default function NavBar() {
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function linkClasse(caminho) {
    return `navbar-link${location.pathname === caminho ? " is-active" : ""}`;
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">
          <span className="navbar-dot" />
          Carregamento
        </span>
        <Link to="/reservas/nova" className={linkClasse("/reservas/nova")}>Nova Reserva</Link>
        <Link to="/reservas" className={linkClasse("/reservas")}>Minhas Reservas</Link>
        <Link to="/alertas" className={linkClasse("/alertas")}>Alertas</Link>
        <Link to="/perfil" className={linkClasse("/perfil")}>Perfil</Link>
        {isAdmin && (
          <>
            <span className="navbar-sep" />
            <Link to="/admin/unidades" className={linkClasse("/admin/unidades")}>Unidades</Link>
            <Link to="/admin/pontos" className={linkClasse("/admin/pontos")}>Pontos</Link>
            <Link to="/admin/historico" className={linkClasse("/admin/historico")}>Histórico</Link>
          </>
        )}
        <button onClick={sair} className="btn btn-ghost btn-sm navbar-spacer">Sair</button>
      </div>
    </nav>
  );
}
