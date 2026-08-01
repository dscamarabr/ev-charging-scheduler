import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Navegação simples compartilhada entre as telas de unidade e do síndico.
// Os links de admin só aparecem para quem tem `unidade.admin = true`
// (checado via RPC `is_admin()`, a mesma usada pelas policies de RLS).
export default function NavBar() {
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <nav
      style={{
        maxWidth: 720,
        margin: "16px auto 0",
        fontFamily: "sans-serif",
        fontSize: 14,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        borderBottom: "1px solid #ddd",
        paddingBottom: 8,
      }}
    >
      <Link to="/reservas/nova">Nova Reserva</Link>
      <Link to="/reservas">Minhas Reservas</Link>
      <Link to="/alertas">Alertas</Link>
      <Link to="/perfil">Perfil</Link>
      {isAdmin && (
        <>
          <span style={{ color: "#999" }}>|</span>
          <Link to="/admin/unidades">Admin: Unidades</Link>
          <Link to="/admin/pontos">Admin: Pontos</Link>
          <Link to="/admin/historico">Admin: Histórico</Link>
        </>
      )}
      <button onClick={sair} style={{ marginLeft: "auto" }}>Sair</button>
    </nav>
  );
}
