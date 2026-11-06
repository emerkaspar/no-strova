import { modeloPorId, modelosDoCatalogo } from './catalogoTreinos.js';
import { calcularSerieForma, diasEntre, somarDias } from './forma.js';
import { pisoDaCargaBase } from './ia.js';
import { estimarEstresseTreino, estresseDoTreino } from './planejamento.js';
import { diaDaSemana, inicioDaSemana } from './semana.js';
import { MINIMO_DA_RODAGEM_MIN, MINIMO_DO_LONGAO_MIN, modeloDoTreinoDeBase, treinosDeBaseDisponiveis } from './treinosDeBase.js';
import { estimarEstresseEstruturado, FOCOS, treinoPlanejadoDoModelo } from './treinosEstruturados.js';

/**
 * Plano anual: do dia de hoje até a prova, distribui a carga (HRSS) por semana em fases (base, construção, pico e
 * polimento) e, a pedido, monta um rascunho de treinos para as próximas semanas. Funções puras, sem Firebase e sem DOM.
 * O rascunho nunca entra no plano sozinho: o usuário revisa e aceita.
 */
export const FASES = Object.freeze({
  base: { rotulo: 'Base', descricao: 'Volume leve e constância para construir a base.' },
  construcao: { rotulo: 'Construção', descricao: 'A carga sobe e entram os treinos de qualidade.' },
  pico: { rotulo: 'Pico', descricao: 'Carga no ponto mais alto, com treinos específicos.' },
  polimento: { rotulo: 'Polimento', descricao: 'A carga cai para chegar descansado no evento.' },
});

export const REGRAS_PLANO_ANUAL = Object.freeze({
  maximoSemanas: 52,
  /** Aumento de carga entre semanas de construção (o app limita a 10%; aqui fica abaixo). */
  crescimentoSemanal: 0.08,
  /** A carga de pico não passa de 1,8 vez a base. */
  tetoSobreBase: 1.8,
  /** A cada 4ª semana (fora do pico), a carga cai para 70% da referência, para assimilar o treino. */
  cicloDeRecuperacao: 4,
  fatorRecuperacao: 0.7,
  /** Semanas de polimento, contando a da prova. Com Forma-alvo, o app escolhe a que mais se aproxima. */
  polimentoPorPrioridade: Object.freeze({ A: 2, B: 1, C: 1 }),
  /** Fração da carga de pico em cada semana de polimento, da mais distante para a semana da prova. */
  fatoresDoPolimento: Object.freeze({ 1: [0.5], 2: [0.7, 0.45], 3: [0.8, 0.6, 0.4] }),
  /** Divisão das semanas de treino (antes do polimento): pico 20%, construção 40%, o resto é base. */
  proporcaoPico: 0.2,
  proporcaoConstrucao: 0.4,
});

const arredondar = (v) => Math.round(v);

/** Soma do estresse dos dias entre duas datas (inclusive). */
function somaDoPeriodo(dias, de, ate) {
  return (dias ?? []).filter((d) => d.data >= de && d.data <= ate).reduce((s, d) => s + (Number.isFinite(d.estresse) ? d.estresse : 0), 0);
}

/** Fases das semanas de treino (antes do polimento): primeiro base, depois construção, por fim pico. */
function fasesDoTreino(quantidade) {
  const R = REGRAS_PLANO_ANUAL;
  const pico = quantidade >= 6 ? Math.round(quantidade * R.proporcaoPico) : 0;
  const construcao = quantidade >= 3 ? Math.round(quantidade * R.proporcaoConstrucao) : 0;
  const base = quantidade - pico - construcao;
  return [...Array(base).fill('base'), ...Array(construcao).fill('construcao'), ...Array(pico).fill('pico')];
}

/** Cargas das semanas de treino: sobe devagar, com semana de recuperação a cada 4ª; o pico se mantém. */
function cargasDoTreino(fases, cargaBase) {
  const R = REGRAS_PLANO_ANUAL;
  const teto = cargaBase * R.tetoSobreBase;
  let referencia = cargaBase;
  return fases.map((fase, i) => {
    if (i === 0) return { carga: referencia, recuperacao: false };
    if ((i + 1) % R.cicloDeRecuperacao === 0 && fase !== 'pico') return { carga: referencia * R.fatorRecuperacao, recuperacao: true };
    if (fase !== 'pico') referencia = Math.min(referencia * (1 + R.crescimentoSemanal), teto);
    return { carga: referencia, recuperacao: false };
  });
}

/** Monta as semanas (sem o realizado) para um número de semanas de polimento. */
function montarSemanas({ inicioDoPlano, totalSemanas, polimento, cargaBase }) {
  const R = REGRAS_PLANO_ANUAL;
  const treino = totalSemanas - polimento;
  const fases = fasesDoTreino(treino);
  const cargas = cargasDoTreino(fases, cargaBase);
  const pico = cargas.reduce((m, c) => Math.max(m, c.carga), cargaBase);
  const fatores = R.fatoresDoPolimento[polimento] ?? R.fatoresDoPolimento[1];

  const semanas = [];
  for (let i = 0; i < totalSemanas; i++) {
    const inicio = somarDias(inicioDoPlano, i * 7);
    const noTreino = i < treino;
    semanas.push({
      inicio,
      fim: somarDias(inicio, 6),
      fase: noTreino ? fases[i] : 'polimento',
      recuperacao: noTreino ? cargas[i].recuperacao : false,
      cargaAlvo: arredondar(noTreino ? cargas[i].carga : pico * fatores[i - treino]),
      semanaDaProva: i === totalSemanas - 1,
    });
  }
  return { semanas, pico: arredondar(pico) };
}

/**
 * Projeta Condicionamento e Forma no dia da prova com a carga de cada semana espalhada igualmente pelos dias (o que já
 * foi realizado até hoje vale como está). A Forma do dia usa os valores do dia anterior, então o estresse da própria
 * prova não conta.
 */
export function projetarNaProva({ dias, semanas, hoje, dataProva }) {
  const estresse = (dias ?? []).filter((d) => d.data <= hoje).map((d) => ({ data: d.data, estresse: d.estresse }));
  for (const s of semanas) {
    const porDia = s.cargaAlvo / 7;
    for (let d = s.inicio; d <= s.fim && d <= dataProva; d = somarDias(d, 1)) {
      if (d > hoje) estresse.push({ data: d, estresse: porDia });
    }
  }
  const serie = calcularSerieForma(estresse, { ate: dataProva });
  const dia = serie.find((d) => d.data === dataProva);
  return dia ? { condicionamento: dia.fitness, forma: dia.forma } : { condicionamento: null, forma: null };
}

/**
 * Plano anual até a prova: semanas, fases, carga-alvo de cada uma e a projeção no dia da prova.
 * @param {{
 *   hoje: string,
 *   prova: { data: string, prioridade: 'A'|'B'|'C', formaAlvo?: number|null },
 *   dias: Array<{ data: string, estresse: number }>,
 *   cargaBase: number,
 *   perfil?: { nivel?: string|null, horasSemana?: number|null }
 * }} p `dias`: o estresse diário realizado; `cargaBase`: a carga semanal de partida (ver cargaBaseSemanal); `perfil`: nível e horas
 *   por semana, que definem a carga de partida quando não há histórico
 * @returns {{ semanas: any[], resumo: object, avisos: string[] }}
 */
export function gerarPlanoAnual({ hoje, prova, dias = [], cargaBase, perfil = {} }) {
  const R = REGRAS_PLANO_ANUAL;
  const avisos = [];
  if (!prova || prova.data < hoje) return { semanas: [], resumo: null, avisos: ['O evento já passou ou não foi informado.'] };

  let base = cargaBase;
  if (!(base > 0)) {
    base = pisoDaCargaBase(perfil);
    avisos.push(`Sem histórico recente de treino: o plano parte de ${base} de carga por semana. Ajuste conforme a sua realidade.`);
  }

  const semanaAtual = inicioDaSemana(hoje);
  const semanaProva = inicioDaSemana(prova.data);
  let inicioDoPlano = semanaAtual;
  let totalSemanas = diasEntre(semanaAtual, semanaProva) / 7 + 1;
  if (totalSemanas > R.maximoSemanas) {
    totalSemanas = R.maximoSemanas;
    inicioDoPlano = somarDias(semanaProva, -7 * (R.maximoSemanas - 1));
    avisos.push(`O evento está a mais de ${R.maximoSemanas} semanas: o plano cobre só as últimas ${R.maximoSemanas} antes dele.`);
  }
  if (totalSemanas < 3) avisos.push('Faltam poucas semanas: o plano é só de polimento e manutenção.');

  // semanas de polimento: o padrão da prioridade, ou, com Forma-alvo, a que deixa a Forma mais perto dela
  const maximoPolimento = Math.max(1, Math.min(3, Math.floor((totalSemanas - 1) / 2) || 1));
  const candidatas = Object.keys(R.fatoresDoPolimento).map(Number).filter((n) => n <= maximoPolimento && n <= totalSemanas);
  let polimento = Math.min(R.polimentoPorPrioridade[prova.prioridade] ?? 1, maximoPolimento, totalSemanas);
  const temAlvo = Number.isFinite(prova.formaAlvo);
  if (temAlvo && candidatas.length > 1) {
    let melhor = null;
    for (const n of candidatas) {
      const { semanas } = montarSemanas({ inicioDoPlano, totalSemanas, polimento: n, cargaBase: base });
      const { forma } = projetarNaProva({ dias, semanas, hoje, dataProva: prova.data });
      const distancia = forma === null ? Infinity : Math.abs(forma - prova.formaAlvo);
      if (melhor === null || distancia < melhor.distancia) melhor = { n, distancia };
    }
    polimento = melhor.n;
  }

  const { semanas, pico } = montarSemanas({ inicioDoPlano, totalSemanas, polimento, cargaBase: base });
  for (const s of semanas) s.realizado = arredondar(somaDoPeriodo(dias, s.inicio, s.fim < hoje ? s.fim : hoje));
  for (const s of semanas) s.atual = s.inicio <= hoje && hoje <= s.fim;

  const projecao = projetarNaProva({ dias, semanas, hoje, dataProva: prova.data });
  if (temAlvo && projecao.forma !== null && Math.abs(projecao.forma - prova.formaAlvo) > 5) {
    avisos.push(
      projecao.forma < prova.formaAlvo
        ? 'Mesmo com o polimento, a Forma projetada fica abaixo da Forma-alvo: considere uma carga menor nas semanas finais ou uma Forma-alvo mais baixa.'
        : 'A Forma projetada fica acima da Forma-alvo: dá para manter mais carga nas semanas finais.',
    );
  }

  return {
    semanas,
    avisos,
    resumo: {
      cargaBase: arredondar(base),
      cargaPico: pico,
      semanasTotal: totalSemanas,
      semanasDePolimento: polimento,
      diasAteProva: diasEntre(hoje, prova.data),
      condicionamentoNaProva: projecao.condicionamento,
      formaNaProva: projecao.forma,
      formaAlvo: temAlvo ? prova.formaAlvo : null,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Rascunho de treinos
// ---------------------------------------------------------------------------------------------------------------------

export const REGRAS_RASCUNHO = Object.freeze({
  semanas: 4,
  diasPadrao: Object.freeze([1, 3, 5, 6]), // terça, quinta, sábado e domingo
  /** Peso do longão na divisão do que falta para a meta da semana (cada rodagem leve pesa 1). */
  pesoDoLongao: 1.5,
  /** Duração máxima (min) das rodagens leves; o mínimo é de 45 min no pedal e 30 na corrida (MINIMO_DA_RODAGEM_MIN). O longão tem 2 h no mínimo e 5 h no máximo. */
  duracaoLeve: Object.freeze({ max: 90 }),
  duracaoLongaoMax: 300,
  /** O longão dura pelo menos 1,4 vez a rodagem leve da semana. */
  proporcaoDoLongao: 1.4,
  /** Passar da meta de carga da semana em até 25% é aceito: o rascunho prefere variar a ficar exatamente na meta. */
  limiteSobreMeta: 1.25,
  diasSemRepetirModelo: 42,
  /** Dias mínimos entre dois treinos intensos (48 h). */
  espacoEntreIntensos: 2,
});

/**
 * Dias de treino (0 = segunda … 6 = domingo) e dia do longão do atleta. Sem dias definidos no perfil vale terça, quinta, sábado e
 * domingo (`padrao` = true); sem dia de longão válido, vale o último dia de fim de semana, ou o último dia de treino.
 */
export function diasDoRascunho(diasTreino, diaLongao) {
  const padrao = !Array.isArray(diasTreino) || diasTreino.length === 0;
  const dias = (padrao ? [...REGRAS_RASCUNHO.diasPadrao] : [...new Set(diasTreino)]).sort((a, b) => a - b);
  const longao = Number.isInteger(diaLongao) && dias.includes(diaLongao) ? diaLongao : [...dias].reverse().find((d) => d >= 5) ?? dias[dias.length - 1];
  return { dias, longao, padrao };
}

/** Soltura leve na véspera da prova: 45 min no pedal e 30 na corrida, em zona 1. */
export function itemDeAtivacao({ vespera, esporte, config, calibracao = null }) {
  const duracao = MINIMO_DA_RODAGEM_MIN[esporte] ?? 30;
  const estresse = estimarEstresseTreino({ zona: 'Z1', duracaoMin: duracao, config, esporte, calibracao }) ?? 0;
  return {
    data: vespera, tipo: 'ativacao', estresse, motivo: 'Soltura leve na véspera do evento.',
    entrada: { esporte, data: vespera, duracaoMin: duracao, zona: 'Z1', observacoes: 'Preparação: soltura leve antes do evento.' },
  };
}

/** Focos preferidos por fase: o que entra nas sessões de qualidade da semana. */
const FOCOS_DA_FASE = Object.freeze({
  base: { moderado: ['progressivo', 'fartlek', 'tempo'], intenso: [] },
  construcao: { moderado: ['tempo', 'progressivo', 'fartlek'], intenso: ['limiar', 'overunder', 'piramide'] },
  pico: { moderado: ['tempo', 'fartlek'], intenso: ['vo2max', 'limiar', 'subidas', 'sprint'] },
  polimento: { moderado: ['progressivo', 'fartlek'], intenso: [] },
});

function hashDe(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

/** Arredonda para múltiplo de 5 minutos. */
const r5 = (minutos) => Math.round(minutos / 5) * 5;
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

/** Sessões de qualidade da semana: uma forte e uma moderada quando há dias (e nível) para isso; nenhuma em semana de recuperação. */
function qualidadeDaSemana({ fase, recuperacao, diasLivres, nivel }) {
  if (recuperacao) return [];
  const segunda = diasLivres >= 4 && nivel !== 'iniciante';
  if (fase === 'base') return segunda ? ['moderada', 'moderada'] : ['moderada'];
  if (fase === 'construcao' || fase === 'pico') return segunda ? ['alta', 'moderada'] : ['alta'];
  return ['moderada']; // polimento
}

/**
 * Rascunho de treinos para as próximas semanas do plano anual, respeitando os dias de treino do atleta. Variedade primeiro:
 *  - **Qualidade:** até duas sessões por semana, uma forte e uma moderada, do catálogo, de focos diferentes; o foco usado há
 *    mais tempo vem primeiro, e nada se repete nas últimas 6 semanas.
 *  - **Longão:** só com 2 horas ou mais (\`MINIMO_DO_LONGAO_MIN\`); se a carga da semana não comporta, o dia vira rodagem.
 *  - **Rodagens leves e longões** vêm de um conjunto de treinos de base com estrutura (\`TREINOS_DE_BASE\`), em rodízio: o que
 *    foi usado há mais tempo volta primeiro, então o mesmo treino não se repete enquanto houver outro.
 *  - **Carga:** as durações seguem a meta da semana, mas passar até 25% é aceito; sem folga, o rascunho tira dias em vez de
 *    encher a semana de sessões curtas.
 *  - Semana da prova: só uma soltura leve na véspera (45 min no pedal, 30 na corrida), nada depois.
 * @param {{
 *   plano: ReturnType<typeof gerarPlanoAnual>, prova: { data: string, esporte: string },
 *   hoje: string, esporte: 'ciclismo'|'corrida', nivel: string,
 *   configEm: (data: string) => any|null,
 *   treinos?: any[], configs?: any[], calibracao?: any, proprios?: any[],
 *   diasTreino?: number[]|null, diaLongao?: number|null, semanas?: number
 * }} p `configEm`: a configuração de FC vigente numa data; `treinos`: os já planejados ou realizados (ocupam o dia e contam na carga da semana)
 * @returns {{ itens: any[], avisos: string[], porSemana: Array<{ inicio: string, cargaAlvo: number, rascunho: number, existente: number }> }}
 */
export function gerarRascunhoDoPlano({
  plano, prova, hoje, esporte, nivel, configEm, treinos = [], configs = [], calibracao = null, proprios = [],
  diasTreino = null, diaLongao = null, semanas: quantasSemanas = REGRAS_RASCUNHO.semanas,
}) {
  const R = REGRAS_RASCUNHO;
  const avisos = [];
  const itens = [];
  const porSemana = [];
  if (!plano?.semanas?.length) return { itens, avisos: ['Não há preparação para o evento para montar o rascunho.'], porSemana };
  if (esporte !== 'ciclismo' && esporte !== 'corrida') return { itens, avisos: ['O rascunho de treinos existe para ciclismo e corrida.'], porSemana };

  const configHoje = configEm(somarDias(hoje, 1));
  if (!configHoje) return { itens, avisos: ['Cadastre a sua configuração de FC (Configuração) para o app estimar o estresse dos treinos.'], porSemana };

  const { dias, longao, padrao } = diasDoRascunho(diasTreino, diaLongao);
  if (padrao) avisos.push('Sem dias de treino definidos no perfil: usei terça, quinta, sábado e domingo.');

  const ativos = treinos.filter((t) => t.status === 'planejado' || t.status === 'realizado');
  const ocupados = new Set(ativos.map((t) => t.data));
  const usadosRecentes = new Set(ativos.filter((t) => t.modeloId && t.data >= somarDias(hoje, -R.diasSemRepetirModelo)).map((t) => t.modeloId));
  const diasIntensos = ativos.filter((t) => (t.zona === 'Z4' || t.zona === 'Z5') && t.data >= somarDias(hoje, -R.espacoEntreIntensos)).map((t) => t.data);
  const longeDe = (data, lista, minimo) => lista.every((d) => Math.abs(diasEntre(d, data)) >= minimo);

  // rodízios: o que foi usado há mais tempo volta primeiro (focos de qualidade e treinos de base)
  let contador = 0;
  const ultimoFoco = new Map();
  const ultimoDeBase = new Map();
  for (const t of [...ativos].sort((a, b) => (a.data < b.data ? -1 : 1))) {
    const m = t.modeloId ? modeloPorId(t.modeloId, proprios) : null;
    if (m && t.data <= hoje) ultimoFoco.set(m.foco, ++contador);
  }

  const hrssPorMinutoLeve = (data) => {
    const v = estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config: configEm(data) ?? configHoje, esporte, calibracao });
    return v > 0 ? v / 60 : null;
  };

  /** Modelo de qualidade: o foco menos usado ultimamente, e dentro dele o de sorteio estável. */
  function escolherQualidade(focos, jaNaSemana, semente) {
    const todos = [...modelosDoCatalogo({ esporte, nivel }), ...proprios.filter((m) => m.esporte === esporte && m.nivel === nivel)];
    let candidatos = todos.filter((m) => focos.includes(m.foco) && !usadosRecentes.has(m.id));
    const semRepetirFoco = candidatos.filter((m) => !jaNaSemana.has(m.foco));
    if (semRepetirFoco.length > 0) candidatos = semRepetirFoco;
    if (candidatos.length === 0) return null;
    const focoVez = [...new Set(candidatos.map((m) => m.foco))].sort((a, b) => (ultimoFoco.get(a) ?? -1) - (ultimoFoco.get(b) ?? -1) || hashDe(`${semente}:${a}`) - hashDe(`${semente}:${b}`))[0];
    return candidatos.filter((m) => m.foco === focoVez).sort((a, b) => hashDe(`${semente}:${a.id}`) - hashDe(`${semente}:${b.id}`))[0];
  }

  /** Treino de base do rodízio (o usado há mais tempo). */
  function escolherDeBase(opcoes, semente) {
    if (opcoes.length === 0) return null;
    const escolhido = [...opcoes].sort((a, b) => (ultimoDeBase.get(a.id) ?? -1) - (ultimoDeBase.get(b.id) ?? -1) || hashDe(`${semente}:${a.id}`) - hashDe(`${semente}:${b.id}`))[0];
    ultimoDeBase.set(escolhido.id, ++contador);
    return escolhido;
  }

  function itemDeBase(treino, duracaoMin, tipo, data) {
    const modelo = modeloDoTreinoDeBase(treino, duracaoMin, esporte);
    const estresse = estimarEstresseEstruturado({ passos: modelo.passos, config: configEm(data) ?? configHoje }) ?? 0;
    return { data, tipo, estresse, modelo, motivo: treino.motivo, entrada: treinoPlanejadoDoModelo(modelo, data) };
  }

  let diasCortados = false;
  let semLongao = false;

  const semanasDoRascunho = plano.semanas.filter((s) => s.fim > hoje).slice(0, quantasSemanas);
  semanasDoRascunho.forEach((semana) => {
    const dataDaProva = prova.data;
    const livres = dias
      .map((d) => somarDias(semana.inicio, d))
      .filter((data) => data > hoje && data <= semana.fim && data <= dataDaProva && !ocupados.has(data) && data !== dataDaProva);
    const existentes = ativos.filter((t) => t.data >= semana.inicio && t.data <= semana.fim && t.status === 'planejado');
    const existente = existentes.reduce((s, t) => s + estresseDoTreino(t, configs, calibracao), 0) + semana.realizado;
    const doDia = [];

    if (semana.semanaDaProva) {
      // soltura curta na véspera da prova e mais nada
      const vespera = somarDias(dataDaProva, -1);
      if (livres.includes(vespera)) doDia.push(itemDeAtivacao({ vespera, esporte, config: configEm(vespera) ?? configHoje, calibracao }));
    } else {
      const dataDoLongao = somarDias(semana.inicio, longao);
      const usados = new Set();
      const focosDaSemana = new Set();
      const intensosDaSemana = [];
      const foco = FOCOS_DA_FASE[semana.fase] ?? FOCOS_DA_FASE.base;

      // 1) sessões de qualidade, longe do longão e (as fortes) a 48 h de outro intenso
      for (const intensidade of qualidadeDaSemana({ fase: semana.fase, recuperacao: semana.recuperacao, diasLivres: livres.length, nivel })) {
        const alta = intensidade === 'alta';
        const focos = alta ? foco.intenso : foco.moderado;
        const dia = livres
          .filter((d) => !usados.has(d) && d !== dataDoLongao)
          .filter((d) => (alta ? longeDe(d, diasIntensos, R.espacoEntreIntensos) && Math.abs(diasEntre(d, dataDoLongao)) >= 2 : longeDe(d, intensosDaSemana, 2)))
          .sort((a, b) => Math.abs(diasEntre(b, dataDoLongao)) - Math.abs(diasEntre(a, dataDoLongao)) || (a < b ? -1 : 1))[0];
        const modelo = dia ? escolherQualidade(focos, focosDaSemana, `${semana.inicio}:${intensidade}`) : null;
        if (!modelo) continue;
        const estresse = estimarEstresseEstruturado({ passos: modelo.passos, config: configEm(dia) ?? configHoje }) ?? 0;
        const forte = FOCOS[modelo.foco]?.intensidade === 'alta';
        doDia.push({
          data: dia, tipo: forte ? 'intenso' : 'moderado', estresse, modelo,
          motivo: `Treino de qualidade da fase de ${FASES[semana.fase].rotulo.toLowerCase()}: ${FOCOS[modelo.foco]?.rotulo ?? modelo.foco}.`,
          entrada: treinoPlanejadoDoModelo(modelo, dia),
        });
        usados.add(dia);
        focosDaSemana.add(modelo.foco);
        ultimoFoco.set(modelo.foco, ++contador);
        usadosRecentes.add(modelo.id);
        if (forte) {
          diasIntensos.push(dia);
          intensosDaSemana.push(dia);
        }
      }

      // 2) longão e rodagens leves: o que cabe na meta da semana (com até 25% de folga)
      const restantes = livres.filter((d) => !usados.has(d));
      const taxa = restantes.length > 0 ? hrssPorMinutoLeve(restantes[0]) : null;
      if (taxa) {
        const gastoFixo = existente + doDia.reduce((s, d) => s + d.estresse, 0);
        const alvo = semana.cargaAlvo;
        const teto = alvo * R.limiteSobreMeta;
        const minimoLongao = MINIMO_DO_LONGAO_MIN[esporte] ?? 120;
        const minimoRodagem = MINIMO_DA_RODAGEM_MIN[esporte] ?? 30;
        const planejar = (leves, comLongao) => {
          const falta = alvo - gastoFixo;
          const pesos = (comLongao ? R.pesoDoLongao : 0) + leves.length;
          const porPeso = pesos > 0 && falta > 0 ? falta / pesos : 0;
          const duracaoLeve = limitar(r5(porPeso / taxa), minimoRodagem, R.duracaoLeve.max);
          const duracaoLongao = comLongao ? limitar(Math.max(r5((porPeso * R.pesoDoLongao) / taxa), minimoLongao, leves.length > 0 ? r5(R.proporcaoDoLongao * duracaoLeve) : 0), minimoLongao, R.duracaoLongaoMax) : 0;
          return { duracaoLeve, duracaoLongao, total: gastoFixo + (leves.length * duracaoLeve + duracaoLongao) * taxa };
        };

        let comLongao = restantes.includes(dataDoLongao);
        let leves = restantes.filter((d) => d !== dataDoLongao);
        let p = planejar(leves, comLongao);
        // sem folga: tira rodagens (do fim da semana para o começo) até caber
        while (p.total > teto && leves.length > 0) {
          leves = leves.slice(0, -1);
          diasCortados = true;
          p = planejar(leves, comLongao);
        }
        // nem o longão cabe: sem 2 h não há longão, o dia vira uma rodagem comum (se couber)
        if (comLongao && p.total > teto) {
          comLongao = false;
          semLongao = true;
          leves = [dataDoLongao];
          p = planejar(leves, false);
          if (p.total > teto) {
            leves = [];
            diasCortados = true;
          }
        }
        p = planejar(leves, comLongao);

        if (comLongao) {
          const opcoes = treinosDeBaseDisponiveis({ tipo: 'longao', duracaoMin: p.duracaoLongao, esporte, recuperacao: semana.recuperacao }).filter((t) => !semana.recuperacao || t.id === 'longao-raiz');
          const t = escolherDeBase(opcoes, `${semana.inicio}:longao`);
          if (t) doDia.push(itemDeBase(t, p.duracaoLongao, 'longao', dataDoLongao));
        }
        for (const data of leves) {
          const opcoes = treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: p.duracaoLeve, recuperacao: semana.recuperacao, esporte });
          const t = escolherDeBase(opcoes.length > 0 ? opcoes : treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: p.duracaoLeve, esporte }), `${semana.inicio}:${data}`);
          if (t) doDia.push(itemDeBase(t, p.duracaoLeve, 'leve', data));
        }
      }
    }

    doDia.sort((a, b) => (a.data < b.data ? -1 : 1));
    const rascunho = doDia.reduce((s, d) => s + (d.estresse ?? 0), 0);
    porSemana.push({ inicio: semana.inicio, cargaAlvo: semana.cargaAlvo, rascunho: arredondar(rascunho), existente: arredondar(existente) });
    for (const d of doDia) itens.push({ ...d, semana: semana.inicio, fase: semana.fase });
  });

  if (semLongao) avisos.push('Sem longão em alguns dias: a carga da semana não comporta 2 horas de treino. Esses dias viraram rodagens comuns.');
  if (diasCortados) avisos.push('Alguns dias ficaram sem treino para não passar muito da meta de carga da semana (aceito até 25% acima).');
  if (itens.length === 0) avisos.push('Nenhum dia livre nas próximas semanas, ou a carga das semanas já está coberta pelo plano.');
  return { itens, avisos, porSemana };
}
