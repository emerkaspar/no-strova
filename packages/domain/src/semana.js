import { somarDias } from './forma.js';

/** Semana de segunda a domingo (convenção do Brasil). Funções puras, sem Firebase e sem DOM. */
export const ROTULOS_DIA = Object.freeze(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
export const NOMES_DIA = Object.freeze(['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']);

/** Posição do dia na semana: 0 = segunda … 6 = domingo. */
export function diaDaSemana(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7;
}

/** Segunda-feira da semana que contém a data. */
export function inicioDaSemana(iso) {
  return somarDias(iso, -diaDaSemana(iso));
}

function somarPorDia(lista) {
  const mapa = new Map();
  for (const { data, estresse } of lista ?? []) {
    if (Number.isFinite(estresse) && estresse > 0) mapa.set(data, (mapa.get(data) ?? 0) + estresse);
  }
  return mapa;
}

/**
 * @typedef {object} DiaDaSemana
 * @property {string} data yyyy-mm-dd
 * @property {string} rotulo SEG, TER…
 * @property {string} nome segunda, terça…
 * @property {string} dia dia do mês com 2 dígitos
 * @property {number} realizado estresse (HRSS) já realizado
 * @property {number} planejado estresse planejado
 * @property {boolean} hoje
 * @property {boolean} futuro
 */

/**
 * Os 7 dias da semana atual, com o estresse realizado e o planejado de cada um.
 * @param {string} hojeIso
 * @param {{ realizado?: Array<{data: string, estresse: number}>, planejado?: Array<{data: string, estresse: number}> }} [dados]
 * @returns {DiaDaSemana[]}
 */
export function montarSemana(hojeIso, { realizado = [], planejado = [] } = {}) {
  const inicio = inicioDaSemana(hojeIso);
  const feito = somarPorDia(realizado);
  const previsto = somarPorDia(planejado);
  return Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(inicio, i);
    return {
      data,
      rotulo: ROTULOS_DIA[i],
      nome: NOMES_DIA[i],
      dia: data.slice(8),
      realizado: feito.get(data) ?? 0,
      planejado: previsto.get(data) ?? 0,
      hoje: data === hojeIso,
      futuro: data > hojeIso,
    };
  });
}

/** Totais da semana. */
export function totaisDaSemana(semana) {
  return semana.reduce(
    (t, d) => ({ realizado: t.realizado + d.realizado, planejado: t.planejado + d.planejado }),
    { realizado: 0, planejado: 0 },
  );
}

const somar = (lista, campo) => lista.reduce((t, x) => t + (Number.isFinite(x[campo]) ? x[campo] : 0), 0);

/**
 * Totais de um período (datas inclusivas): número de atividades, tempo, distância e carga (HRSS do estresse diário).
 * @param {{ atividades?: Array<{data: string, duracaoS?: number, distanciaM?: number}>, dias?: Array<{data: string, estresse: number}> }} dados
 */
export function resumoDoPeriodo({ atividades = [], dias = [] } = {}, de, ate) {
  const noPeriodo = (x) => x.data >= de && x.data <= ate;
  const feitas = atividades.filter(noPeriodo);
  return {
    atividades: feitas.length,
    duracaoS: somar(feitas, 'duracaoS'),
    distanciaM: somar(feitas, 'distanciaM'),
    carga: somar(dias.filter(noPeriodo), 'estresse'),
  };
}

/** A semana até hoje comparada com o mesmo trecho da semana passada (segunda até o mesmo dia da semana). */
export function comparativoSemanal(hojeIso, dados) {
  const inicio = inicioDaSemana(hojeIso);
  return {
    atual: resumoDoPeriodo(dados, inicio, hojeIso),
    anterior: resumoDoPeriodo(dados, somarDias(inicio, -7), somarDias(hojeIso, -7)),
  };
}

/**
 * Semanas seguidas com treino. A sequência continua viva enquanto a semana atual não acabou: sem treino nesta
 * semana, conta as semanas anteriores seguidas.
 * @param {string[]} datasComTreino yyyy-mm-dd dos dias com treino
 * @returns {{ atual: number, recorde: number, nestaSemana: boolean }}
 */
export function sequenciaSemanal(datasComTreino, hojeIso) {
  const semanas = new Set((datasComTreino ?? []).map(inicioDaSemana));
  const atualInicio = inicioDaSemana(hojeIso);
  const nestaSemana = semanas.has(atualInicio);
  let atual = 0;
  for (let cursor = nestaSemana ? atualInicio : somarDias(atualInicio, -7); semanas.has(cursor); cursor = somarDias(cursor, -7)) atual++;
  let recorde = 0;
  let corrida = 0;
  let anterior = null;
  for (const inicio of [...semanas].sort()) {
    corrida = anterior !== null && somarDias(anterior, 7) === inicio ? corrida + 1 : 1;
    recorde = Math.max(recorde, corrida);
    anterior = inicio;
  }
  return { atual, recorde, nestaSemana };
}

/** O próximo treino planejado (de hoje em diante), o mais cedo; null se não houver. */
export function proximoTreinoPlanejado(treinos, hojeIso) {
  return (
    [...(treinos ?? [])]
      .filter((t) => t.status === 'planejado' && t.data >= hojeIso)
      .sort((a, b) => (a.data === b.data ? String(a.id).localeCompare(String(b.id)) : a.data < b.data ? -1 : 1))[0] ?? null
  );
}
