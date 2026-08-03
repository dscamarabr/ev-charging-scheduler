import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatarHora, rotuloDia } from "../../lib/formatarDataHora.js";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import NavBar from "../../components/NavBar.jsx";

// UC-07, UC-08, UC-09, UC-10 — Wireframes, tela 04. Layout com a reserva
// ativa/confirmada em destaque (card "hero") e o restante como histórico
// compacto — opção B escolhida pelo síndico entre as sugestões de redesign.
export default function MinhasReservas() {
  const [reservas, setReservas] = useState([]);
  const [agora, setAgora] = useState(new Date());

  async function carregar() {
    // A policy `reserva_select` libera SELECT em toda a tabela pra quem é
    // admin (pra alimentar o Histórico Administrativo) — então, sem esse
    // filtro explícito, um síndico via aqui as reservas de TODAS as
    // unidades em vez de só a própria. minha_unidade_id() garante que esta
    // tela mostra sempre apenas a unidade de quem está logado, admin ou não.
    const { data: minhaUnidadeId } = await supabase.rpc("minha_unidade_id");
    const { data } = await supabase
      .from("reserva")
      .select("*, ponto_carregamento(nome)")
      .eq("unidade_id", minhaUnidadeId)
      .order("inicio_previsto", { ascending: false });
    setReservas(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  // Atualiza a barra de progresso e a contagem "começa em..." do card em
  // destaque sem precisar de uma ação do usuário pra re-renderizar.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Reserva ativa (confirmada ou em andamento) sempre em primeiro — no
  // máximo uma existe por vez (RN-01), mas o critério vale mesmo que isso
  // mude no futuro. As demais mantêm a ordenação por início decrescente
  // que já vem da consulta.
  function prioridade(r) {
    return r.status === "confirmada" || r.status === "em_andamento" ? 0 : 1;
  }
  const reservasOrdenadas = [...reservas].sort((a, b) => {
    const diferencaPrioridade = prioridade(a) - prioridade(b);
    if (diferencaPrioridade !== 0) return diferencaPrioridade;
    return new Date(b.inicio_previsto) - new Date(a.inicio_previsto);
  });
  const ativa = reservasOrdenadas.find((r) => prioridade(r) === 0);
  const historico = ativa ? reservasOrdenadas.slice(1) : reservasOrdenadas;

  function progressoEmAndamento(r) {
    const inicio = new Date(r.inicio_previsto).getTime();
    const fim = new Date(r.fim_previsto).getTime();
    const total = fim - inicio;
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((agora.getTime() - inicio) / total) * 100)));
  }

  function descricaoInicio(r) {
    const diffMin = Math.round((new Date(r.inicio_previsto).getTime() - agora.getTime()) / 60000);
    if (diffMin <= 0) return "a qualquer momento";
    if (diffMin < 60) return `em ${diffMin} min`;
    const horas = Math.floor(diffMin / 60);
    const min = diffMin % 60;
    return min > 0 ? `em ${horas}h${min}min` : `em ${horas}h`;
  }

  async function cancelar(id) {
    if (!confirm("Cancelar esta reserva? Essa ação não pode ser desfeita.")) return;
    await supabase.rpc("cancelar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function liberar(id) {
    if (!confirm("Liberar o ponto agora? Isso encerra sua reserva antes do horário previsto.")) return;
    await supabase.rpc("liberar_reserva", { p_reserva_id: id });
    carregar();
  }

  async function avisarAtraso(minhaReservaId) {
    // Passa pela Edge Function `alertas`, que preserva o anonimato (RNF-08).
    // Precisa do Authorization com o JWT do usuário — a function usa esse
    // token pra descobrir a unidade de quem está chamando (via auth.uid()).
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alertas?acao=disparar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ minha_reserva_id: minhaReservaId }),
      });

      if (!resp.ok && resp.status !== 400) {
        // 404 (function não está sendo servida), 401/403, 500 etc. — o
        // corpo pode nem ser JSON (ex.: página de erro do dev server).
        alert(`Falha ao enviar (HTTP ${resp.status}). A Edge Function "alertas" está rodando? (supabase functions serve)`);
        return;
      }

      const json = await resp.json();
      // Sem isso, o clique não dava nenhum retorno visível — sucesso ou erro
      // (ex.: RN-09, "não há reserva atrasada") passavam despercebidos.
      alert(json.error ? `Não foi possível enviar: ${json.error}` : json.mensagem ?? "Alerta enviado.");
    } catch (err) {
      // fetch lança exceção se não conseguir nem conectar (function fora do ar)
      alert(`Não foi possível conectar à Edge Function "alertas": ${traduzirErro(err.message)}`);
    }
  }

  return (
    <>
    <NavBar />
    <main className="page">
      <h1 className="section">Minhas Reservas</h1>

      {reservas.length === 0 && <p className="empty-state">Você ainda não tem reservas.</p>}

      {ativa && (
        <div className="reserva-hero">
          <div className="reserva-hero-eyebrow">
            {ativa.status === "em_andamento" ? "Reserva ativa" : "Reserva confirmada"}
          </div>
          <div className="row row--between">
            <div className="reserva-hero-titulo">
              {ativa.ponto_carregamento?.nome} · {ativa.tipo === "diurna" ? "Diurna" : "Noturna"}
            </div>
            <StatusBadge status={ativa.status} />
          </div>
          <div className="reserva-hero-horario">
            {formatarHora(ativa.inicio_previsto)} – {formatarHora(ativa.fim_previsto)}
          </div>

          {ativa.status === "em_andamento" ? (
            <>
              <div className="reserva-hero-progresso-track">
                <div
                  className="reserva-hero-progresso-fill"
                  style={{ width: `${progressoEmAndamento(ativa)}%` }}
                />
              </div>
              <div className="reserva-hero-progresso-legenda">
                {progressoEmAndamento(ativa)}% do tempo reservado
              </div>
            </>
          ) : (
            <div className="reserva-hero-progresso-legenda">Começa {descricaoInicio(ativa)}</div>
          )}

          <div className="reserva-hero-acoes">
            {ativa.status === "confirmada" && (
              <button onClick={() => cancelar(ativa.id)} className="btn reserva-hero-btn-cancelar">
                Cancelar
              </button>
            )}
            {ativa.status === "em_andamento" && (
              <>
                <button onClick={() => liberar(ativa.id)} className="btn reserva-hero-btn-primario">
                  Liberar agora
                </button>
                <button onClick={() => avisarAtraso(ativa.id)} className="btn reserva-hero-btn-secundario">
                  Solicitar retirada de veículo
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <>
          <div className="historico-label">Histórico</div>
          <div className="stack" style={{ gap: 10 }}>
            {historico.map((r) => (
              <div key={r.id} className="historico-item">
                <div className="historico-item-icone">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
                  </svg>
                </div>
                <div className="historico-item-info">
                  <strong>{r.ponto_carregamento?.nome} · {r.tipo === "diurna" ? "Diurna" : "Noturna"}</strong>
                  <div className="historico-item-sub">
                    {rotuloDia(r.inicio_previsto)}, {formatarHora(r.inicio_previsto)} – {formatarHora(r.fim_real ?? r.fim_previsto)}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
    </>
  );
}
