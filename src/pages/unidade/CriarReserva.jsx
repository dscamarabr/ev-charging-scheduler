import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { traduzirErro } from "../../lib/traduzirErro.js";
import { formatarHora, rotuloDia } from "../../lib/formatarDataHora.js";
import NavBar from "../../components/NavBar.jsx";

// Duração sugerida como ponto de partida no modal — o valor real é sempre
// ajustável pela unidade antes de confirmar. RN-02/RF-14 continuam sendo a
// validação de verdade, feita no servidor pela RPC.
const DURACAO_PADRAO_MINUTOS = 180;

function inicioDoDia(offsetDias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return d;
}

function formatarHHMM(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function rotuloDiaChip(offsetDias) {
  if (offsetDias === 0) return "Hoje";
  if (offsetDias === 1) return "Amanhã";
  const d = inicioDoDia(offsetDias);
  const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const diaSemanaCapitalizado = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
  return `${diaSemanaCapitalizado} ${d.getDate()}`;
}

function rotuloDiaConfirmacao(offsetDias) {
  if (offsetDias === 0) return "hoje";
  if (offsetDias === 1) return "amanhã";
  const d = inicioDoDia(offsetDias);
  const pad = (n) => String(n).padStart(2, "0");
  return `dia ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// UC-06 — Criar Reserva (RF-08 a RF-14) — chips de dia + lista de horários
// sugeridos (hora cheia é só atalho) + modal pra ajustar início/duração
// exatos, aceitando minutos quebrados.
export default function CriarReserva() {
  const [pontos, setPontos] = useState([]);
  const [pontoId, setPontoId] = useState("");
  const [config, setConfig] = useState(null);
  const [reservasDoPonto, setReservasDoPonto] = useState([]);
  const [diaOffset, setDiaOffset] = useState(0);

  // Modal de horário/duração (aberto ao tocar numa sugestão diurna).
  const [modalAberto, setModalAberto] = useState(false);
  const [modalHora, setModalHora] = useState(""); // "HH:MM"
  const [modalDuracao, setModalDuracao] = useState(DURACAO_PADRAO_MINUTOS);
  // true enquanto o horário do modal ainda é "agora" sem ter sido tocado —
  // nesse caso, ao confirmar, usamos o instante exato do clique de
  // confirmação (em vez do HH:MM, que só tem precisão de minuto).
  const [modalAgoraFixo, setModalAgoraFixo] = useState(false);

  // RN-01: 1 reserva ativa/futura por unidade. Normalmente obterTelaInicial()
  // já evita cair nesta tela nesse caso, mas dá pra chegar aqui direto (ex.:
  // aba "Agendar" da barra inferior) mesmo com uma reserva em andamento —
  // por isso a checagem também é feita aqui, substituindo o formulário por
  // um aviso com atalho pra reserva já existente.
  const [reservaAtiva, setReservaAtiva] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("ponto_carregamento")
      .select("*")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        setPontos(data ?? []);
        if (data?.length) setPontoId((atual) => atual || data[0].id);
      });
    supabase
      .from("configuracao_global")
      .select("*")
      .single()
      .then(({ data }) => setConfig(data));

    supabase.rpc("minha_unidade_id").then(async ({ data: unidadeId }) => {
      if (!unidadeId) return;
      const { data } = await supabase
        .from("reserva")
        .select("*, ponto_carregamento(nome)")
        .eq("unidade_id", unidadeId)
        .in("status", ["confirmada", "em_andamento"])
        .limit(1);
      setReservaAtiva(data && data.length > 0 ? data[0] : null);
    });
  }, []);

  useEffect(() => {
    setModalAberto(false);
    if (!pontoId) {
      setReservasDoPonto([]);
      return;
    }

    // Janela de busca cobre o período em que ainda dá pra reservar
    // (RN-02: até 7 dias de antecedência), com uma folga de 1 dia pra
    // cobrir o fim de uma reserva noturna que começou no limite.
    async function buscarReservas() {
      const agora = new Date();
      const limite = new Date(agora.getTime() + 8 * 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from("reserva")
        .select("inicio_previsto, fim_previsto, fim_real")
        .eq("ponto_id", pontoId)
        .neq("status", "cancelada")
        .lte("inicio_previsto", limite.toISOString())
        .gte("fim_previsto", agora.toISOString());
      setReservasDoPonto(data ?? []);
    }

    buscarReservas();

    // A lista de reservas de outras unidades não atualiza sozinha (sem
    // isso, quem deixasse a tela aberta continuaria vendo um horário como
    // "disponível" mesmo depois de outra unidade tê-lo reservado — só
    // descobria o conflito de verdade ao tentar confirmar, já que a
    // validação real acontece no servidor). Refaz a busca periodicamente
    // e sempre que a aba volta a ficar em primeiro plano.
    const intervalo = setInterval(buscarReservas, 20000);
    function aoFocar() {
      if (document.visibilityState === "visible") buscarReservas();
    }
    document.addEventListener("visibilitychange", aoFocar);
    window.addEventListener("focus", buscarReservas);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.removeEventListener("focus", buscarReservas);
    };
  }, [pontoId]);

  useEffect(() => {
    setModalAberto(false);
  }, [diaOffset]);

  const pontoSelecionado = pontos.find((p) => p.id === pontoId);

  // Fim "de verdade" de uma reserva: se ela já foi encerrada (liberação
  // manual antecipada — RF-16 — ou o job automático de fim de janela),
  // fim_real é o horário real em que o ponto ficou livre, que pode ser
  // BEM antes do fim_previsto original (ex.: reserva noturna liberada às
  // 23h, fim_previsto ainda marcando 06h). Sem isso, o ponto parecia
  // ocupado até o fim_previsto mesmo já tendo sido liberado.
  function fimEfetivo(r) {
    return new Date(r.fim_real ?? r.fim_previsto);
  }

  // Retorna null se o intervalo estiver livre, ou o horário em que o ponto
  // fica livre (maior fim efetivo entre as reservas que conflitam) — usada
  // pra checar um intervalo [inicio, fim) específico.
  function conflitoAte(inicio, fim) {
    const conflitos = reservasDoPonto.filter(
      (r) => inicio < fimEfetivo(r) && fim > new Date(r.inicio_previsto)
    );
    if (conflitos.length === 0) return null;
    return new Date(Math.max(...conflitos.map((r) => fimEfetivo(r).getTime())));
  }

  // Diz se um instante específico está dentro de alguma reserva existente
  // (sonda de duração zero) — usada só como informação (não bloqueia mais
  // o clique: a hora cheia é uma sugestão, não uma obrigação).
  function ocupadoNoInstante(instante) {
    const conflito = reservasDoPonto.find(
      (r) => instante >= new Date(r.inicio_previsto) && instante < fimEfetivo(r)
    );
    return conflito ? fimEfetivo(conflito) : null;
  }

  // Empurra um candidato de início pra frente até um instante realmente
  // livre, caso ele caia dentro de uma reserva existente. Sempre arredonda
  // pro próximo minuto cheio DEPOIS do fim da reserva conflitante — se ela
  // termina às 17:04 (com ou sem segundos quebrados), a próxima só pode
  // começar às 17:05, pra bater com o "ocupado até" mostrado na tela (que
  // já é truncado pro minuto).
  function proximoInicioLivre(inicio) {
    let candidato = new Date(inicio);
    for (let i = 0; i < 10; i++) {
      const conflito = reservasDoPonto.find(
        (r) => candidato >= new Date(r.inicio_previsto) && candidato < fimEfetivo(r)
      );
      if (!conflito) return candidato;
      const fim = fimEfetivo(conflito);
      fim.setSeconds(0, 0);
      fim.setMinutes(fim.getMinutes() + 1);
      candidato = fim;
    }
    return candidato;
  }

  // Quantos minutos livres existem a partir de `inicio` até a próxima
  // reserva começar (ou null se não há nenhuma reserva futura conhecida
  // nessa janela) — usado só pra sugerir uma duração inicial sensata.
  function duracaoLivreApartir(inicio) {
    const proximos = reservasDoPonto
      .map((r) => new Date(r.inicio_previsto))
      .filter((d) => d > inicio)
      .sort((a, b) => a - b);
    if (proximos.length === 0) return null;
    return Math.max(1, Math.floor((proximos[0].getTime() - inicio.getTime()) / 60000));
  }

  // Minutos entre `inicio` e o horário de fechamento (RN-04, regra global
  // do condomínio — ex.: 21h) do mesmo dia de `inicio`. Reserva diurna não
  // pode passar desse horário, então a duração sugerida/máxima no modal
  // também respeita esse limite, além do fim da próxima reserva.
  function minutosAteFechamento(inicio) {
    if (!config) return null;
    const [horaFechamento] = config.horario_fechamento.split(":").map(Number);
    const fechamento = new Date(inicio);
    fechamento.setHours(horaFechamento, 0, 0, 0);
    return Math.max(0, Math.floor((fechamento.getTime() - inicio.getTime()) / 60000));
  }

  // Combina os limites de verdade (máximo do ponto, vaga até a próxima
  // reserva e vaga até o fechamento) numa única duração máxima permitida —
  // usada no atributo `max` do campo do modal.
  function duracaoMaximaEm(inicio) {
    const limites = [
      pontoSelecionado?.duracao_maxima_minutos,
      duracaoLivreApartir(inicio),
      minutosAteFechamento(inicio),
    ].filter((v) => v !== null && v !== undefined);
    return limites.length ? Math.max(1, Math.min(...limites)) : DURACAO_PADRAO_MINUTOS;
  }

  // Duração inicial sugerida ao abrir o modal: o padrão de 180min, mas sem
  // ultrapassar a duração máxima de verdade calculada acima.
  function duracaoSugeridaEm(inicio) {
    return Math.min(DURACAO_PADRAO_MINUTOS, duracaoMaximaEm(inicio));
  }

  function gerarSlotsDoDia(offsetDias) {
    if (!config) return [];
    const agora = new Date();
    const limiteAntecedencia = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
    const baseDia = inicioDoDia(offsetDias);
    const [horaAbertura] = config.horario_abertura.split(":").map(Number);
    const [horaFechamento] = config.horario_fechamento.split(":").map(Number);
    const slots = [];

    // "Agora" — só faz sentido no dia de hoje, dentro do expediente. Se o
    // ponto estiver ocupado neste exato instante (ex.: outra unidade em
    // andamento até 13:53, com "agora" sendo 13:26), o slot continua
    // aparecendo — só que marcado como ocupado, igual às sugestões de hora
    // cheia — em vez de simplesmente sumir até a próxima hora cheia
    // disponível. Ao tocar, o modal já abre resolvido pro instante exato em
    // que o ponto fica livre (ver tocarSugestao/abrirModal).
    if (offsetDias === 0) {
      const horaAtual = agora.getHours() + agora.getMinutes() / 60;
      if (horaAtual >= horaAbertura && horaAtual < horaFechamento) {
        slots.push({
          chave: "agora",
          tipo: "diurna",
          inicio: agora,
          rotulo: "Agora",
          ocupadoAte: ocupadoNoInstante(agora),
        });
      }
    }

    // Horários cheios dentro do expediente diurno — são só sugestões de
    // atalho; se a hora cheia cair em cima de uma reserva existente, o
    // rótulo avisa até quando. O botão só fica realmente desabilitado
    // quando o atraso empurra o início pra além da própria hora sugerida
    // (ex.: 15h/16h quando há reserva só até 17:04) — nesse caso a
    // sugestão não faz mais sentido. Se o atraso é pequeno (ex.: 17h
    // ocupado só até 17:04), o botão continua clicável e o modal já
    // resolve o próximo horário realmente livre.
    for (let h = horaAbertura; h < horaFechamento; h++) {
      const inicio = new Date(baseDia);
      inicio.setHours(h, 0, 0, 0);
      if (inicio <= agora || inicio > limiteAntecedencia) continue;
      const ocupadoAte = ocupadoNoInstante(inicio);
      const resolvido = proximoInicioLivre(inicio);
      const bloqueado = resolvido.getTime() - inicio.getTime() >= 60 * 60000;
      slots.push({
        chave: `h${h}`,
        tipo: "diurna",
        inicio,
        rotulo: `${String(h).padStart(2, "0")}:00`,
        ocupadoAte,
        bloqueado,
      });
    }

    // Bloco noturno fixo (RN-05): sempre 21h-06h, sem duração ajustável.
    // O FIM é sempre fixo às 06h (a RPC recalcula isso de verdade — ver
    // 0009_noturna_fim_fixo_apos_21h.sql). Se o bloco de hoje já começou
    // (passou das 21h) e ninguém reservou ainda, oferecemos entrar "agora"
    // em vez de esconder a sugestão até o dia seguinte — melhor aproveitar
    // o resto da janela do que perder o horário inteiro.
    const inicioTeoricoNoturna = new Date(baseDia);
    inicioTeoricoNoturna.setHours(21, 0, 0, 0);
    const fimNoturna = new Date(inicioTeoricoNoturna.getTime() + 9 * 60 * 60000);
    const noturnaJaComecouEAindaLivre = offsetDias === 0 && agora > inicioTeoricoNoturna && agora < fimNoturna;

    if ((inicioTeoricoNoturna > agora || noturnaJaComecouEAindaLivre) && inicioTeoricoNoturna <= limiteAntecedencia) {
      const inicioNoturnaEfetivo = noturnaJaComecouEAindaLivre ? agora : inicioTeoricoNoturna;
      const ocupadoAte = conflitoAte(inicioNoturnaEfetivo, fimNoturna);
      slots.push({
        chave: "noturna",
        tipo: "noturna",
        inicio: inicioNoturnaEfetivo,
        agoraFixo: noturnaJaComecouEAindaLivre,
        rotulo: noturnaJaComecouEAindaLivre ? "Agora até 06:00 (noturna)" : "21:00 às 06:00 (noturna)",
        bloqueado: !!ocupadoAte,
        ocupadoAte,
      });
    }

    return slots;
  }

  const slotsDoDia = gerarSlotsDoDia(diaOffset);

  function abrirModal(baseInicio, agoraFixo) {
    const resolvido = proximoInicioLivre(baseInicio);
    setModalHora(formatarHHMM(resolvido));
    setModalDuracao(duracaoSugeridaEm(resolvido));
    setModalAgoraFixo(agoraFixo);
    setModalAberto(true);
  }

  async function tocarSugestao(slot) {
    if (!pontoId) {
      alert("Selecione um ponto de carregamento.");
      return;
    }
    if (slot.chave === "noturna") {
      const rotuloDiaMsg = rotuloDiaConfirmacao(diaOffset);
      const mensagem = slot.agoraFixo
        ? `Confirma reserva noturna a partir de agora até 06:00 de ${rotuloDiaConfirmacao(1)}?`
        : `Confirma reserva iniciando ${rotuloDiaMsg} às 21:00h com duração de 540 minutos (21h às 06h do dia seguinte)?`;
      if (!confirm(mensagem)) return;
      // Igual ao slot "Agora" diurno: recalcula o instante exato na hora de
      // confirmar (com 1 min de folga) em vez do horário já renderizado,
      // pra não cair no passado por causa do tempo do confirm() do
      // navegador + rede (ver migration 0006_fix_criar_reserva_no_passado).
      const inicioReal = slot.agoraFixo ? new Date(Date.now() + 60000) : slot.inicio;
      const { error } = await supabase.rpc("criar_reserva", {
        p_ponto_id: pontoId,
        p_tipo: "noturna",
        p_inicio: inicioReal.toISOString(),
        p_duracao_minutos: null,
      });
      if (error) {
        alert(traduzirErro(error.message));
        return;
      }
      navigate("/reservas");
      return;
    }

    // O truque de "usar o instante exato do clique de confirmação" (ver
    // abrirModal/confirmarModal) só faz sentido quando o ponto está livre
    // agora de verdade — se "Agora" está ocupado, tratamos como um horário
    // normal: abrirModal já resolve pro próximo instante livre (13:54, no
    // exemplo acima) via proximoInicioLivre.
    abrirModal(slot.inicio, slot.chave === "agora" && !slot.ocupadoAte);
  }

  // Combina o dia escolhido (chips) com o horário do modal (aceita minutos
  // quebrados) — usado pra pré-visualização de disponibilidade e confirmar.
  function modalHoraParaData() {
    if (!/^\d{2}:\d{2}$/.test(modalHora)) return null;
    const [h, m] = modalHora.split(":").map(Number);
    const d = inicioDoDia(diaOffset);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const modalInicio = modalAberto && !modalAgoraFixo ? modalHoraParaData() : null;
  const modalFim = modalInicio
    ? new Date(modalInicio.getTime() + Number(modalDuracao || 0) * 60000)
    : null;
  const modalConflito = modalInicio ? conflitoAte(modalInicio, modalFim) : null;
  const modalNoPassado = modalInicio ? modalInicio <= new Date() : false;
  // Duração máxima "de contexto" (próxima reserva + horário de fechamento +
  // limite do ponto), recalculada conforme o horário do modal muda.
  const modalDuracaoMaxima = modalAberto ? duracaoMaximaEm(modalAgoraFixo ? new Date() : modalInicio ?? new Date()) : null;

  async function confirmarModal() {
    if (!modalAgoraFixo && (!modalInicio || modalNoPassado)) {
      alert("Informe um horário de início válido.");
      return;
    }

    // Pro modo "Agora" ainda intacto (usuário não mexeu no horário),
    // recalcula o instante na hora de confirmar, com 1 min de folga: entre
    // este cálculo e o `now()` do Postgres dentro da RPC (rede + o próprio
    // confirm() do navegador) passam alguns segundos, e sem essa margem a
    // reserva podia chegar com p_inicio já no passado e ser recusada.
    const inicioReal = modalAgoraFixo ? new Date(Date.now() + 60000) : modalInicio;
    const duracaoFinal = Number(modalDuracao);

    const rotuloDiaMsg = rotuloDiaConfirmacao(diaOffset);
    const mensagem = `Confirma reserva iniciando ${rotuloDiaMsg} às ${inicioReal.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}h com duração de ${duracaoFinal} minutos?`;

    if (!confirm(mensagem)) return;

    // A validação de RN-01, RN-02, RN-04, RN-05 e RF-14 acontece dentro
    // da RPC (ver supabase/migrations/0001_schema_inicial.sql) — o
    // frontend só repassa a intenção do usuário.
    const { error } = await supabase.rpc("criar_reserva", {
      p_ponto_id: pontoId,
      p_tipo: "diurna",
      p_inicio: inicioReal.toISOString(),
      p_duracao_minutos: duracaoFinal,
    });

    if (error) {
      alert(traduzirErro(error.message));
      return;
    }
    navigate("/reservas");
  }

  return (
    <>
    <NavBar />
    <main className="page page--narrow">
      <h1 className="section">Nova Reserva</h1>

      {pontos.length === 0 && (
        <p className="form-error">
          Nenhum ponto de carregamento ativo no momento. Fale com o síndico.
        </p>
      )}

      {pontos.length > 0 && reservaAtiva && (
        <div className="reserva-hero">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <div className="reserva-bloqueada-icone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            </div>
            <div className="reserva-hero-titulo">Você já tem uma reserva</div>
          </div>
          <div className="reserva-hero-progresso-legenda" style={{ marginTop: 14 }}>
            {reservaAtiva.ponto_carregamento?.nome} · {reservaAtiva.tipo === "diurna" ? "Diurna" : "Noturna"}
            {reservaAtiva.status === "em_andamento" ? ", em andamento" : ""}
          </div>
          <div className="reserva-hero-progresso-legenda">
            {formatarHora(reservaAtiva.inicio_previsto)} – {formatarHora(reservaAtiva.fim_previsto)} · {rotuloDia(reservaAtiva.inicio_previsto).toLowerCase()}
          </div>
          <div className="reserva-hero-progresso-legenda" style={{ marginTop: 10 }}>
            Só é possível ter uma reserva por vez. Cancele-a ou aguarde ela terminar.
          </div>
          <div className="reserva-hero-acoes">
            <button type="button" onClick={() => navigate("/reservas")} className="btn reserva-hero-btn-primario">
              Ver minha reserva
            </button>
          </div>
        </div>
      )}

      {pontos.length > 0 && !reservaAtiva && (
        <div className="stack">
          <div className="ponto-picker">
            <div className="ponto-picker-icone">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="8" width="10" height="9" rx="1.5" />
                <path d="M9 8V6a1 1 0 0 1 1-1h0M13 8V6a1 1 0 0 1 1-1h0M16 11h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1" />
              </svg>
            </div>
            <div className="ponto-picker-texto">
              <span className="ponto-picker-label">Ponto de carregamento</span>
              <select
                className="ponto-picker-select"
                value={pontoId}
                onChange={(e) => setPontoId(e.target.value)}
              >
                {pontos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <svg className="ponto-picker-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>

          <div className="field">
            Dia
            <div className="chips-dia">
              {Array.from({ length: 8 }, (_, i) => i).map((offset) => (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setDiaOffset(offset)}
                  className={`chip-dia${diaOffset === offset ? " is-ativo" : ""}`}
                >
                  {rotuloDiaChip(offset)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            Horários sugeridos
            {slotsDoDia.length === 0 && (
              <p className="empty-state" style={{ padding: "8px 0" }}>
                Nenhum horário sugerido neste dia.
              </p>
            )}
            <div className="stack" style={{ gap: 8 }}>
              {slotsDoDia.map((slot) => {
                const icone =
                  slot.chave === "agora" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
                  ) : slot.chave === "noturna" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
                    </svg>
                  );
                const classes = [
                  "horario-item",
                  slot.chave === "agora" ? "is-agora" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={slot.chave}
                    type="button"
                    disabled={slot.bloqueado}
                    onClick={() => tocarSugestao(slot)}
                    className={classes}
                  >
                    <span className="horario-item-icone">{icone}</span>
                    <span className="horario-item-texto">
                      <span className="horario-item-titulo">{slot.rotulo}</span>
                      <span className="horario-item-sub">
                        {slot.ocupadoAte
                          ? `Ocupado até ${slot.ocupadoAte.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                          : "Disponível"}
                      </span>
                    </span>
                    {!slot.bloqueado && (
                      <svg className="horario-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalAberto(false);
          }}
        >
          <div className="modal-card">
            <h2 className="section" style={{ marginTop: 0 }}>Ajustar reserva</h2>

            <div className="stack">
              <div className="field">
                Horário de início
                <input
                  type="time"
                  value={modalAgoraFixo ? formatarHHMM(new Date()) : modalHora}
                  onChange={(e) => {
                    setModalAgoraFixo(false);
                    setModalHora(e.target.value);
                  }}
                  min={config?.horario_abertura?.slice(0, 5)}
                  max={config?.horario_fechamento?.slice(0, 5)}
                />
                {modalAgoraFixo && <small>Vai usar o horário exato do momento em que você confirmar.</small>}
              </div>

              <div className="field">
                Duração (minutos)
                <input
                  type="number"
                  value={modalDuracao}
                  onChange={(e) => setModalDuracao(e.target.value)}
                  min={1}
                  max={modalDuracaoMaxima ?? pontoSelecionado?.duracao_maxima_minutos}
                />
                {modalDuracaoMaxima != null && (
                  <small>Máx. {modalDuracaoMaxima} min (considerando o fechamento e outras reservas)</small>
                )}
              </div>

              {!modalAgoraFixo && modalHora && (
                modalNoPassado ? (
                  <p className="form-error">Esse horário já passou.</p>
                ) : modalConflito ? (
                  <p className="form-error">
                    Ocupado até {modalConflito.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
                  </p>
                ) : (
                  <p className="form-success">Disponível.</p>
                )
              )}

              <div className="row">
                <button type="button" onClick={() => setModalAberto(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="button" onClick={confirmarModal} className="btn btn-primary">
                  Confirmar Reserva
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}
