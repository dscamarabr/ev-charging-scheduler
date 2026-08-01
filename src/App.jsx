import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import RequireAuth from "./components/RequireAuth.jsx";

import Login from "./pages/unidade/Login.jsx";
import AceitarConvite from "./pages/unidade/AceitarConvite.jsx";
import CriarReserva from "./pages/unidade/CriarReserva.jsx";
import MinhasReservas from "./pages/unidade/MinhasReservas.jsx";
import Alertas from "./pages/unidade/Alertas.jsx";
import Perfil from "./pages/unidade/Perfil.jsx";

import AdminUnidades from "./pages/admin/Unidades.jsx";
import AdminPontos from "./pages/admin/Pontos.jsx";
import AdminHistorico from "./pages/admin/Historico.jsx";

// Rotas espelham as telas do Wireframes.docx (seções 3 e 4) e os
// casos de uso do Casos_de_Uso_User_Stories.docx.
//
// Todas as rotas exceto /login exigem sessão ativa (RequireAuth); as de
// admin (/admin/*) exigem além disso que a unidade tenha admin = true.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Unidade (PWA) — UC-02, UC-06 a UC-12 */}
        <Route path="/login" element={<Login />} />
        <Route path="/convite" element={<AceitarConvite />} />
        <Route path="/reservas/nova" element={<RequireAuth><CriarReserva /></RequireAuth>} />
        <Route path="/reservas" element={<RequireAuth><MinhasReservas /></RequireAuth>} />
        <Route path="/alertas" element={<RequireAuth><Alertas /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><Perfil /></RequireAuth>} />

        {/* Síndico (painel admin) — UC-01, UC-03, UC-04, UC-05, UC-13, UC-14 */}
        <Route path="/admin/unidades" element={<RequireAuth adminOnly><AdminUnidades /></RequireAuth>} />
        <Route path="/admin/pontos" element={<RequireAuth adminOnly><AdminPontos /></RequireAuth>} />
        <Route path="/admin/historico" element={<RequireAuth adminOnly><AdminHistorico /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}
