/**
 * Estresse por frequência cardíaca (HRSS), replicando o método do Elevate
 * (appcore/modules/shared/sync/compute/activity-computer.ts):
 *
 *   HRR%          = max((FCmédia − FCrepouso) / (FCmáx − FCrepouso), 0) × 100, arredondado a 3 casas
 *   TRIMP         = (tempoEmMovimento / 60) × HRR × 0,64 × e^(k × HRR)      (HRR em fração)
 *   TRIMP@LTHR    = 60 × HRRlthr × 0,64 × e^(k × HRRlthr)                   (uma hora no limiar)
 *   HRSS          = TRIMP / TRIMP@LTHR × 100
 *
 * k = 1,92 (masculino) ou 1,67 (feminino). Funções puras, sem Firebase e sem DOM.
 */

export const SEXOS = Object.freeze({ MASCULINO: 'masculino', FEMININO: 'feminino' });

const K_MASCULINO = 1.92;
const K_FEMININO = 1.67;

/** Acima disso por hora, o Elevate sinaliza o HRSS como anormal. */
export const LIMITE_HRSS_POR_HORA = 225;

/**
 * Fração da FC no limiar (LTHR) usada como FC média presumida de cada zona (pontos médios
 * das zonas de Joe Friel). Usada quando a atividade não tem FC.
 */
export const ZONAS = Object.freeze({
  Z1: { rotulo: 'Z1 — Recuperação', fracaoLthr: 0.75 },
  Z2: { rotulo: 'Z2 — Aeróbico', fracaoLthr: 0.85 },
  Z3: { rotulo: 'Z3 — Tempo', fracaoLthr: 0.92 },
  Z4: { rotulo: 'Z4 — Limiar', fracaoLthr: 0.97 },
  Z5: { rotulo: 'Z5 — VO2máx', fracaoLthr: 1.03 },
});

/**
 * @typedef {object} ConfigFc
 * @property {number} fcMax
 * @property {number} fcRepouso
 * @property {number} lthr
 * @property {string} sexo
 */

function fatorTrimp(sexo) {
  return sexo === SEXOS.FEMININO ? K_FEMININO : K_MASCULINO;
}

/** Reserva de frequência cardíaca (fração, nunca negativa). */
export function reservaFc(fc, fcMax, fcRepouso) {
  return Math.max((fc - fcRepouso) / (fcMax - fcRepouso), 0);
}

/** TRIMP de Banister. `hrrPercent` em 0–100. */
export function trimp(segundos, hrrPercent, sexo) {
  const hrr = hrrPercent / 100;
  return (segundos / 60) * hrr * 0.64 * Math.exp(fatorTrimp(sexo) * hrr);
}

/**
 * HRSS a partir da FC média e do tempo em movimento.
 * @param {{ fcMedia: number, tempoMovimentoS: number, config: ConfigFc }} entrada
 * @returns {number|null} null quando não dá para calcular (sem FC, sem tempo ou config inválida)
 */
export function calcularHrss({ fcMedia, tempoMovimentoS, config }) {
  if (!Number.isFinite(fcMedia) || fcMedia <= 0) return null;
  if (!Number.isFinite(tempoMovimentoS) || tempoMovimentoS <= 0) return null;
  if (!config || !(config.fcMax > config.fcRepouso)) return null;

  const hrrPercent = Math.round(reservaFc(fcMedia, config.fcMax, config.fcRepouso) * 100 * 1000) / 1000;
  if (hrrPercent <= 0) return null;

  const reservaLthr = (config.lthr - config.fcRepouso) / (config.fcMax - config.fcRepouso);
  const trimpUmaHoraNoLimiar = 60 * reservaLthr * 0.64 * Math.exp(fatorTrimp(config.sexo) * reservaLthr);
  const hrss = (trimp(tempoMovimentoS, hrrPercent, config.sexo) / trimpUmaHoraNoLimiar) * 100;
  return Number.isFinite(hrss) && hrss > 0 ? hrss : null;
}

/** FC média presumida para a zona informada, limitada à FC máxima do atleta. */
export function fcMediaDaZona(zona, config) {
  const def = ZONAS[zona];
  if (!def || !config) return null;
  return Math.min(Math.round(config.lthr * def.fracaoLthr), config.fcMax);
}

/**
 * Estimativa de HRSS para atividade sem FC, a partir da zona predominante e da duração.
 * @returns {number|null}
 */
export function estimarHrssPorZona({ zona, duracaoS, config }) {
  const fcMedia = fcMediaDaZona(zona, config);
  if (fcMedia === null) return null;
  return calcularHrss({ fcMedia, tempoMovimentoS: duracaoS, config });
}

/** HRSS por hora, para detectar valores anormais. */
export function hrssPorHora(hrss, tempoMovimentoS) {
  if (!Number.isFinite(hrss) || !(tempoMovimentoS > 0)) return null;
  return (hrss / tempoMovimentoS) * 3600;
}

/** Arredonda o HRSS para armazenamento (2 casas). */
export function arredondarHrss(valor) {
  return valor === null || valor === undefined ? null : Math.round(valor * 100) / 100;
}
