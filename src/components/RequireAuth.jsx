import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Guarda de rota: sem isso, qualquer pessoa acessando a URL direto (ex.
// /reservas ou /admin/unidades) via link entrava sem estar logada — o
// backend (RLS) sempre protegeu os dados, mas a tela em si abria vazia
// em vez de mandar pro /login.
//
// Uso:
//   <RequireAuth><MinhasReservas /></RequireAuth>           // exige apenas login
//   <RequireAuth adminOnly><AdminUnidades /></RequireAuth>  // exige síndico
export default function RequireAuth({ children, adminOnly = false }) {
  const [status, setStatus] = useState("loading"); // loading | ok | unauth | forbidden
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    async function checar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (mounted) setStatus("unauth");
        return;
      }

      if (adminOnly) {
        const { data: isAdmin } = await supabase.rpc("is_admin");
        if (mounted) setStatus(isAdmin ? "ok" : "forbidden");
      } else {
        if (mounted) setStatus("ok");
      }
    }

    checar();

    // Reage a login/logout feitos em outra aba/momento sem precisar recarregar
    const { data: subscription } = supabase.auth.onAuthStateChange(() => checar());

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [adminOnly]);

  if (status === "loading") return null;

  if (status === "unauth") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === "forbidden") {
    return <Navigate to="/reservas/nova" replace />;
  }

  return children;
}
