import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/unidade/Login.jsx";
import Home from "./pages/unidade/Home.jsx";
import CriarReserva from "./pages/unidade/CriarReserva.jsx";
import MinhasReservas from "./pages/unidade/MinhasReservas.jsx";
import Alertas from "./pages/unidade/Alertas.jsx";

import AdminUnidades from "./pages/admin/Unidades.jsx";
import AdminPontos from "./pages/admin/Pontos.jsx";
import AdminHistorico from "./pages/admin/Historico.jsx";

// Rotas espelham as telas do Wireframes.docx (seções 3 e 4) e os
// casos de uso do Casos_de_Uso_User_Stories.docx.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Unidade (PWA) — UC-02, UC-06 a UC-12 */}
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/reservas/nova" element={<CriarReserva />} />
        <Route path="/reservas" element={<MinhasReservas />} />
        <Route path="/alertas" element={<Alertas />} />

        {/* Síndico (painel admin) — UC-01, UC-03, UC-04, UC-05, UC-13, UC-14 */}
        <Route path="/admin/unidades" element={<AdminUnidades />} />
        <Route path="/admin/pontos" element={<AdminPontos />} />
        <Route path="/admin/historico" element={<AdminHistorico />} />
      </Routes>
    </BrowserRouter>
  );
}
