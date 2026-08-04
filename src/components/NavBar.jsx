import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { tentarInscricaoAutomatica } from "../lib/pushNotifications.js";

// Ícones de linha simples (sem dependência de biblioteca externa) usados
// nas abas da barra inferior.
const ICONES = {
  nova: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  reservas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  alertas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  perfil: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  admin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4z" />
    </svg>
  ),
};

const ABAS_UNIDADE = [
  { to: "/reservas/nova", icone: "nova", rotulo: "Agendar" },
  { to: "/reservas", icone: "reservas", rotulo: "Reservas" },
  { to: "/alertas", icone: "alertas", rotulo: "Alertas" },
  { to: "/perfil", icone: "perfil", rotulo: "Perfil" },
];

// Navegação em duas partes: barra superior fina (logo + sair) e barra
// inferior fixa com as abas — estilo app de celular. Unidade comum vê 4
// abas; quem é admin (checado via RPC `is_admin()`, a mesma usada pelas
// policies de RLS) vê uma 5ª aba "Admin" que leva ao hub administrativo.
export default function NavBar() {
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
    // RF-23/RF-24: notificações vêm ativas por padrão — tenta inscrever o
    // aparelho sozinho na primeira vez (a função já sai sem fazer nada se
    // a permissão já foi decidida antes ou se o membro desativou em
    // Perfil). Roda em toda tela autenticada, mas é barata: só pede
    // permissão de verdade quando ainda está "default".
    tentarInscricaoAutomatica();
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const abas = isAdmin
    ? [...ABAS_UNIDADE, { to: "/admin", icone: "admin", rotulo: "Admin" }]
    : ABAS_UNIDADE;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/reservas/nova" className="navbar-brand">
            <img src="/icons/icon-192.png" alt="" className="navbar-logo" />
            Grand Soleil
          </Link>
          <button onClick={sair} className="btn btn-ghost btn-sm">Sair</button>
        </div>
      </header>

      <nav className="bottombar">
        {abas.map((aba) => {
          const ativo = aba.to === "/admin"
            ? location.pathname.startsWith("/admin")
            : location.pathname === aba.to;
          return (
            <Link key={aba.to} to={aba.to} className={`bottombar-item${ativo ? " is-active" : ""}`}>
              {ICONES[aba.icone]}
              <span>{aba.rotulo}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
