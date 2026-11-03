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
