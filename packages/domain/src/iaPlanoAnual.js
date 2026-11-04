import { CATALOGO_TREINOS, modeloPorId } from './catalogoTreinos.js';
import { diasEntre, somarDias } from './forma.js';
import { estresseDoTreino } from './planejamento.js';
import { diasDoRascunho, FASES, itemDeAtivacao, REGRAS_RASCUNHO } from './planoAnual.js';
import { diaDaSemana } from './semana.js';
import { REGRAS_SUGESTAO } from './sugestaoTreinos.js';
import { MINIMO_DA_RODAGEM_MIN, MINIMO_DO_LONGAO_MIN, modeloDoTreinoDeBase, TREINOS_DE_BASE } from './treinosDeBase.js';
import { estimarEstresseEstruturado, FOCOS, resumirTreino, treinoPlanejadoDoModelo } from './treinosEstruturados.js';

/**
 * Rascunho do plano anual com IA. A IA só **escolhe** (treino do catálogo ou treino de base com a duração que ela achar certa,
 * para cada dia livre) e **explica**; tudo o que ela devolve passa por `validarRascunhoAnualDaIa` antes de virar rascunho, e as
 * regras valem no código, não só no prompt. O resultado tem o mesmo formato do rascunho por regras (`gerarRascunhoDoPlano`), então
 * a revisão e o "Aceitar" são os mesmos. Funções puras, sem Firebase e sem DOM.
 */
export const LIMITES_IA_PLANO_ANUAL = Object.freeze({
  semanas: 4,
  observacaoMax: 300,
  /** O mesmo treino do catálogo não se repete em menos de 14 dias. */
  diasSemRepetirModelo: 14,
  motivoMax: 160,
});

const ORDEM_DE_NIVEL = Object.freeze({ iniciante: 0, intermediario: 1, avancado: 2 });
const r5 = (minutos) => Math.round(minutos / 5) * 5;
const arredondar = (v) => Math.round(v);

/** Limites de duração (min) de um treino de base para o esporte: rodagem de 45 min (pedal) ou 30 (corrida) e longão de 2 h. */
export function limitesDoTreinoDeBase(treino, esporte) {
  const piso = treino.tipo === 'longao' ? MINIMO_DO_LONGAO_MIN[esporte] ?? 120 : MINIMO_DA_RODAGEM_MIN[esporte] ?? 30;
  return { min: Math.max(treino.minMin, piso), max: treino.maxMin };
}

/**
 * O que a IA pode escolher: o catálogo do esporte (até o nível do atleta, sem o teste de LTHR), com a duração e o estresse
 * estimado de cada treino, e os treinos de base, em que a IA escolhe a duração (estresse por minuto aproximado).
 * @param {{ esporte: string, nivel: string, configEm: (data: string) => any|null, hoje: string }} p
 */
export function menuParaIa({ esporte, nivel, configEm, hoje }) {
  const config = configEm(somarDias(hoje, 1));
  const teto = ORDEM_DE_NIVEL[nivel] ?? ORDEM_DE_NIVEL.intermediario;
  const catalogo = CATALOGO_TREINOS.filter((m) => m.esporte === esporte && (ORDEM_DE_NIVEL[m.nivel] ?? 0) <= teto && FOCOS[m.foco]?.intensidade !== 'teste').map((m) => ({
    id: m.id,
    nome: m.nome,
    foco: m.foco,
    intensidade: FOCOS[m.foco]?.intensidade ?? 'moderada',
    nivel: m.nivel,
    duracaoMin: resumirTreino(m.passos).duracaoMin,
    estresse: estimarEstresseEstruturado({ passos: m.passos, config }) ?? 0,
  }));
  const base = TREINOS_DE_BASE.map((t) => {
    const { min, max } = limitesDoTreinoDeBase(t, esporte);
    const referencia = Math.min(max, Math.max(min, t.tipo === 'longao' ? 150 : 60));
    const estresse = estimarEstresseEstruturado({ passos: t.passos(referencia), config }) ?? 0;
    return { id: t.id, nome: t.nome, tipo: t.tipo, minMin: min, maxMin: max, estresseNaReferencia: arredondar(estresse), minutosDaReferencia: referencia, recuperacao: t.recuperacao === true };
  });
  return { catalogo, base };
}

/**
 * As semanas do rascunho com o que a IA precisa saber de cada uma: dias livres, o que já está feito ou planejado e o dia do
 * longão. Os dias livres seguem o perfil do atleta: de amanhã em diante, sem treino planejado ou realizado, até a prova (sem ela).
 */
export function contextoDasSemanas({ plano, prova, hoje, treinos = [], configs = [], calibracao = null, diasTreino = null, diaLongao = null, semanas: quantas = LIMITES_IA_PLANO_ANUAL.semanas }) {
  const { dias, longao } = diasDoRascunho(diasTreino, diaLongao);
  const ativos = treinos.filter((t) => t.status === 'planejado' || t.status === 'realizado');
  const ocupados = new Set(ativos.map((t) => t.data));
  return (plano?.semanas ?? [])
    .filter((s) => s.fim > hoje)
    .slice(0, quantas)
    .map((semana) => {
      const livres = dias
        .map((d) => somarDias(semana.inicio, d))
        .filter((data) => data > hoje && data <= semana.fim && data <= prova.data && !ocupados.has(data) && data !== prova.data);
      const existentes = ativos.filter((t) => t.data >= semana.inicio && t.data <= semana.fim && t.status === 'planejado');
      const existente = existentes.reduce((s, t) => s + estresseDoTreino(t, configs, calibracao), 0) + semana.realizado;
      return { semana, livres, existente: arredondar(existente), dataDoLongao: somarDias(semana.inicio, longao) };
    });
}

const ehZonaIntensa = (zona) => zona === 'Z4' || zona === 'Z5';

/**
 * Confere a resposta da IA contra as regras e devolve o rascunho no formato do rascunho por regras. O que violar uma regra é
 * **descartado** (com um aviso em português), e a duração dos treinos de base é ajustada para dentro dos limites:
 *  - só os dias livres de treino do atleta, um treino por dia, e nada na semana da prova (lá vale só a soltura da véspera);
 *  - só treinos do catálogo do esporte, até o nível do atleta e sem o teste de LTHR; treinos de base com a duração limitada
 *    (rodagem de 45 min no pedal e 30 na corrida, longão de 2 h a 5 h) e o longão só no dia de longão do perfil;
 *  - semana de recuperação e de polimento sem treino forte; até 2 fortes por semana, com 48 h entre eles;
 *  - a carga de cada semana fica no máximo 25% acima da meta (treino de base é encurtado; o do catálogo, descartado);
 *  - o mesmo treino do catálogo não se repete em 14 dias.
 * @param {{ treinos?: Array<{ data: string, origem: 'catalogo'|'base', id: string, duracaoMin?: number, motivo?: string }> }|null} saida
 * @param {{
 *   plano: any, prova: { data: string }, hoje: string, esporte: 'ciclismo'|'corrida', nivel: string,
 *   configEm: (data: string) => any|null, treinos?: any[], configs?: any[], calibracao?: any,
 *   diasTreino?: number[]|null, diaLongao?: number|null, semanas?: number
 * }} ctx `treinos`: os já planejados ou realizados (ocupam o dia, contam na carga e na variedade)
 * @returns {{ itens: any[], avisos: string[], porSemana: Array<{ inicio: string, cargaAlvo: number, rascunho: number, existente: number }> }}
 */
export function validarRascunhoAnualDaIa(saida, ctx) {
  const { plano, prova, hoje, esporte, nivel, configEm, treinos = [], configs = [], calibracao = null, diasTreino = null, diaLongao = null } = ctx;
  const R = REGRAS_RASCUNHO;
  const avisos = [];
  const itens = [];
  const porSemana = [];
  if (!plano?.semanas?.length) return { itens, avisos: ['Não há plano anual para montar o rascunho.'], porSemana };
  if (esporte !== 'ciclismo' && esporte !== 'corrida') return { itens, avisos: ['O rascunho de treinos existe para ciclismo e corrida.'], porSemana };
  const configHoje = configEm(somarDias(hoje, 1));
  if (!configHoje) return { itens, avisos: ['Cadastre a sua configuração de FC (Configuração) para o app estimar o estresse dos treinos.'], porSemana };

  const { longao } = diasDoRascunho(diasTreino, diaLongao);
  const contexto = contextoDasSemanas({ plano, prova, hoje, treinos, configs, calibracao, diasTreino, diaLongao, semanas: ctx.semanas });
  const estadoDaSemana = new Map(contexto.map((c) => [c.semana.inicio, { ...c, total: c.existente, intensos: 0, escolhidos: [] }]));
  const semanaDoDia = new Map();
  for (const c of contexto) for (const d of c.livres) semanaDoDia.set(d, c.semana.inicio);

  const ativos = treinos.filter((t) => t.status === 'planejado' || t.status === 'realizado');
  const diasIntensos = ativos
    .filter((t) => t.data >= somarDias(hoje, -R.espacoEntreIntensos))
    .filter((t) => {
      const m = t.modeloId ? modeloPorId(t.modeloId) : null;
      return m ? FOCOS[m.foco]?.intensidade === 'alta' : ehZonaIntensa(t.zona);
    })
    .map((t) => t.data);
  const usoDoModelo = new Map(); // id do catálogo → datas em que aparece (no plano e no rascunho)
  for (const t of ativos) if (t.modeloId) usoDoModelo.set(t.modeloId, [...(usoDoModelo.get(t.modeloId) ?? []), t.data]);
  const usados = new Set();

  const pedidos = Array.isArray(saida?.treinos) ? saida.treinos.filter((t) => t && typeof t.data === 'string') : [];
  const ordenados = [...pedidos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const descartar = (t, motivo) => avisos.push(`Descartei o treino de ${t.data}: ${motivo}.`);

  for (const t of ordenados) {
    const inicio = semanaDoDia.get(t.data);
    const estado = inicio ? estadoDaSemana.get(inicio) : null;
    if (!estado) {
      const daProva = [...estadoDaSemana.values()].find((e) => e.semana.semanaDaProva && t.data >= e.semana.inicio && t.data <= e.semana.fim);
      descartar(t, daProva ? 'na semana da prova só vale a soltura da véspera' : 'o dia não está entre os seus dias livres de treino');
      continue;
    }
    if (usados.has(t.data)) {
      descartar(t, 'já há outro treino nesse dia');
      continue;
    }
    const { semana } = estado;
    if (semana.semanaDaProva) {
      descartar(t, 'na semana da prova só vale a soltura da véspera');
      continue;
    }
    const teto = semana.cargaAlvo * R.limiteSobreMeta;
    let modelo;
    let estresse;
    let intensidade;
    let tipo;

    if (t.origem === 'base') {
      const base = TREINOS_DE_BASE.find((x) => x.id === t.id);
      if (!base) {
        descartar(t, 'o treino de base não existe');
        continue;
      }
      if (base.tipo === 'longao' && diaDaSemana(t.data) !== longao) {
        descartar(t, 'o longão só vai no dia de longão do seu perfil');
        continue;
      }
      if (semana.recuperacao && !(base.tipo === 'leve' ? base.recuperacao : base.id === 'longao-raiz')) {
        descartar(t, 'semana de recuperação pede treino bem leve');
        continue;
      }
      const { min, max } = limitesDoTreinoDeBase(base, esporte);
      const pedida = Number(t.duracaoMin);
      let duracao = Number.isFinite(pedida) ? Math.min(max, Math.max(min, r5(pedida))) : min;
      if (Number.isFinite(pedida) && duracao !== r5(pedida)) avisos.push(`Ajustei a duração de “${base.nome}” em ${t.data} para ${duracao} min (limites do treino: ${min} a ${max} min).`);
      const montar = (d) => {
        const m = modeloDoTreinoDeBase(base, d, esporte);
        return { m, e: estimarEstresseEstruturado({ passos: m.passos, config: configEm(t.data) ?? configHoje }) ?? 0 };
      };
      let { m, e } = montar(duracao);
      while (estado.total + e > teto && duracao - 5 >= min) {
        duracao -= 5;
        ({ m, e } = montar(duracao));
      }
      if (estado.total + e > teto) {
        descartar(t, 'passaria da meta de carga da semana');
        continue;
      }
      modelo = m;
      estresse = e;
      intensidade = 'baixa';
      tipo = base.tipo;
    } else if (t.origem === 'catalogo') {
      const m = typeof t.id === 'string' ? modeloPorId(t.id) : null;
      if (!m || m.origem !== 'catalogo') {
        descartar(t, 'o treino não existe no catálogo');
        continue;
      }
      if (m.esporte !== esporte || (ORDEM_DE_NIVEL[m.nivel] ?? 0) > (ORDEM_DE_NIVEL[nivel] ?? 1) || FOCOS[m.foco]?.intensidade === 'teste') {
        descartar(t, `“${m.nome}” não serve para o seu esporte ou nível`);
        continue;
      }
      intensidade = FOCOS[m.foco]?.intensidade ?? 'moderada';
      if (intensidade !== 'baixa' && (semana.recuperacao || semana.fase === 'polimento')) {
        descartar(t, semana.recuperacao ? 'semana de recuperação pede treino bem leve' : 'o polimento não tem treino de qualidade');
        continue;
      }
      if ((usoDoModelo.get(m.id) ?? []).some((d) => Math.abs(diasEntre(d, t.data)) < LIMITES_IA_PLANO_ANUAL.diasSemRepetirModelo)) {
        descartar(t, `“${m.nome}” já aparece há menos de ${LIMITES_IA_PLANO_ANUAL.diasSemRepetirModelo} dias`);
        continue;
      }
      estresse = estimarEstresseEstruturado({ passos: m.passos, config: configEm(t.data) ?? configHoje }) ?? 0;
      if (estado.total + estresse > teto) {
        descartar(t, `“${m.nome}” passaria da meta de carga da semana`);
        continue;
      }
      modelo = m;
      tipo = intensidade === 'alta' ? 'intenso' : intensidade === 'moderada' ? 'moderado' : m.foco === 'resistencia' && resumirTreino(m.passos).duracaoMin >= 120 ? 'longao' : 'leve';
    } else {
      descartar(t, 'tipo de treino desconhecido');
      continue;
    }

    if (intensidade === 'alta') {
      if (estado.intensos >= REGRAS_SUGESTAO.maximoIntensosPorSemana || diasIntensos.some((d) => Math.abs(diasEntre(d, t.data)) < R.espacoEntreIntensos)) {
        descartar(t, 'mais de 2 treinos fortes na semana ou menos de 48 h entre dois fortes');
        continue;
      }
      estado.intensos += 1;
      diasIntensos.push(t.data);
    }
    usados.add(t.data);
    estado.total += estresse;
    if (modelo.id) usoDoModelo.set(modelo.id, [...(usoDoModelo.get(modelo.id) ?? []), t.data]);
    const motivo = typeof t.motivo === 'string' && t.motivo.trim() ? t.motivo.trim().slice(0, LIMITES_IA_PLANO_ANUAL.motivoMax) : `Fase de ${FASES[semana.fase].rotulo.toLowerCase()}.`;
    const item = { data: t.data, tipo, estresse, modelo, motivo, entrada: treinoPlanejadoDoModelo(modelo, t.data), semana: semana.inicio, fase: semana.fase };
    estado.escolhidos.push(item);
    itens.push(item);
  }

  // semana da prova: o código põe a soltura da véspera (a IA não decide isso)
  const vespera = somarDias(prova.data, -1);
  const daProva = contexto.find((c) => c.semana.semanaDaProva && c.livres.includes(vespera));
  if (daProva) {
    const item = { ...itemDeAtivacao({ vespera, esporte, config: configEm(vespera) ?? configHoje, calibracao }), semana: daProva.semana.inicio, fase: daProva.semana.fase };
    itens.push(item);
    estadoDaSemana.get(daProva.semana.inicio).escolhidos.push(item);
  }

  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  for (const c of contexto) {
    const e = estadoDaSemana.get(c.semana.inicio);
    porSemana.push({ inicio: c.semana.inicio, cargaAlvo: c.semana.cargaAlvo, rascunho: arredondar(e.escolhidos.reduce((s, i) => s + i.estresse, 0)), existente: c.existente });
  }
  const vazios = contexto.reduce((n, c) => n + c.livres.length, 0) - itens.length;
  if (vazios > 0 && itens.length > 0) avisos.push(`${vazios} ${vazios === 1 ? 'dia livre ficou' : 'dias livres ficaram'} sem treino.`);
  if (itens.length === 0) avisos.push('Nenhum treino da IA passou pelas regras de segurança.');
  return { itens, avisos, porSemana };
}
