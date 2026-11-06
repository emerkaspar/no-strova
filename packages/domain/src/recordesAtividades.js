import { somarDias } from './forma.js';
import { inicioDaSemana, sequenciaSemanal } from './semana.js';

/**
 * Período, resumo e recordes de uma lista de atividades. Funções puras, sem Firebase e sem DOM.
 * Período: '30d' (últimos 30 dias), '6m' (últimos 6 meses), 'ano' (ano atual), 'ano:2025' (um ano) ou 'tudo'.
 */

export const PERIODOS_RAPIDOS = Object.freeze([
  { id: '30d', rotulo: '30 dias' },
  { id: '6m', rotulo: '6 meses' },
  { id: 'ano', rotulo: 'Este ano' },
  { id: 'tudo', rotulo: 'Tudo' },
]);

/** Intervalo [de, ate] (yyyy-mm-dd, inclusive) do período; null para "tudo" ou período desconhecido. */
export function intervaloDoPeriodo(periodo, hojeIso) {
  const ano = Number(hojeIso.slice(0, 4));
  if (periodo === '30d') return { de: somarDias(hojeIso, -29), ate: hojeIso };
  if (periodo === '6m') {
    const [a, m, d] = hojeIso.split('-').map(Number);
    const alvo = new Date(Date.UTC(a, m - 1 - 6, 1));
    const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, '0');
    return { de: `${alvo.getUTCFullYear()}-${pad(alvo.getUTCMonth() + 1)}-${pad(Math.min(d, ultimoDia))}`, ate: hojeIso };
  }
  if (periodo === 'ano') return { de: `${ano}-01-01`, ate: hojeIso };
  const doAno = /^ano:(\d{4})$/.exec(String(periodo));
  if (doAno) return { de: `${doAno[1]}-01-01`, ate: `${doAno[1]}-12-31` };
  return null;
}

/** Atividades do período (todas, quando o período é "tudo"). */
export function filtrarPorPeriodo(atividades, periodo, hojeIso) {
  const intervalo = intervaloDoPeriodo(periodo, hojeIso);
  if (!intervalo) return [...atividades];
  return atividades.filter((a) => a.data >= intervalo.de && a.data <= intervalo.ate);
}

/** Anos que têm atividade, do mais recente ao mais antigo. */
export function anosComAtividades(atividades) {
  return [...new Set(atividades.map((a) => Number(String(a.data).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a);
}

const soma = (lista, campo) => lista.reduce((total, a) => total + (Number.isFinite(a[campo]) ? a[campo] : 0), 0);

/** Totais da lista: quantidade, tempo, distância, elevação e HRSS. */
export function resumoDasAtividades(atividades) {
  return {
    atividades: atividades.length,
    duracaoS: soma(atividades, 'duracaoS'),
    distanciaM: soma(atividades, 'distanciaM'),
    altimetriaM: soma(atividades, 'altimetriaM'),
    hrss: soma(atividades, 'hrss'),
  };
}

/** Campos com recorde: o maior valor de uma única atividade. */
export const CAMPOS_DE_RECORDE = Object.freeze({
  distancia: 'distanciaM',
  duracao: 'duracaoS',
  elevacao: 'altimetriaM',
  hrss: 'hrss',
  fcMax: 'fcMax',
  potencia: 'potenciaMediaW',
  potencia20min: 'potenciaMax20minW',
});

/**
 * Recorde de cada campo: a atividade de maior valor (só vale valor acima de zero; no empate fica a mais antiga).
 * @returns {Record<string, { valor: number, atividade: any }|null>}
 */
export function recordesDasAtividades(atividades) {
  const recordes = {};
  for (const [id, campo] of Object.entries(CAMPOS_DE_RECORDE)) {
    let melhor = null;
    for (const a of atividades) {
      const v = a[campo];
      if (!Number.isFinite(v) || v <= 0) continue;
      if (melhor === null || v > melhor.valor || (v === melhor.valor && a.data < melhor.atividade.data)) melhor = { valor: v, atividade: a };
    }
    recordes[id] = melhor;
  }
  return recordes;
}

/** Velocidade média em m/s: distância ÷ tempo em movimento (ou a duração, sem ele); null sem distância ou tempo. */
export function velocidadeMediaMs(atividade) {
  const tempo = atividade.tempoMovimentoS > 0 ? atividade.tempoMovimentoS : atividade.duracaoS;
  if (!(atividade.distanciaM > 0) || !(tempo > 0)) return null;
  return atividade.distanciaM / tempo;
}

/**
 * Maior Condicionamento (fitness) da série diária, opcionalmente dentro de um intervalo; no empate fica o dia mais
 * antigo. Null sem valores positivos.
 * @param {Array<{ data: string, fitness: number }>} serie
 * @param {{ de: string, ate: string }|null} [intervalo]
 */
export function maiorCondicionamento(serie, intervalo = null) {
  let melhor = null;
  for (const d of serie ?? []) {
    if (intervalo && (d.data < intervalo.de || d.data > intervalo.ate)) continue;
    if (!Number.isFinite(d.fitness) || d.fitness <= 0) continue;
    if (melhor === null || d.fitness > melhor.valor) melhor = { valor: d.fitness, data: d.data };
  }
  return melhor;
}

/**
 * A semana (segunda a domingo) de maior carga: soma do HRSS das atividades da semana. No empate fica a mais antiga.
 * @returns {{ valor: number, inicio: string }|null} `inicio` é a segunda-feira da semana
 */
export function semanaMaisPesada(atividades) {
  const porSemana = new Map();
  for (const a of atividades) {
    if (!Number.isFinite(a.hrss) || a.hrss <= 0) continue;
    const inicio = inicioDaSemana(a.data);
    porSemana.set(inicio, (porSemana.get(inicio) ?? 0) + a.hrss);
  }
  let melhor = null;
  for (const [inicio, valor] of porSemana) {
    if (melhor === null || valor > melhor.valor || (valor === melhor.valor && inicio < melhor.inicio)) melhor = { valor, inicio };
  }
  return melhor;
}

/** Maior sequência de semanas seguidas com treino (null sem atividades). */
export function maiorSequenciaDeSemanas(atividades, hojeIso) {
  if (atividades.length === 0) return null;
  const { recorde } = sequenciaSemanal(atividades.map((a) => a.data), hojeIso);
  return recorde > 0 ? { valor: recorde } : null;
}
