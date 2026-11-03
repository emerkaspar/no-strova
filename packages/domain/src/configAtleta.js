import { SEXOS } from './hrss.js';
import { dataIsoValida } from './usuarios.js';

/**
 * Configuração do atleta com data de vigência: vale a partir de `vigenteDesde` até a próxima.
 * @typedef {object} ConfigAtleta
 * @property {string} [id]
 * @property {string} vigenteDesde yyyy-mm-dd
 * @property {number} fcMax
 * @property {number} fcRepouso
 * @property {number} lthr
 * @property {string} sexo
 * @property {number} pesoKg
 * @property {number} alturaCm
 */

export const LIMITES_CONFIG = Object.freeze({
  fcMax: { min: 100, max: 250 },
  fcRepouso: { min: 25, max: 120 },
  pesoKg: { min: 20, max: 400 },
  alturaCm: { min: 100, max: 250 },
});

function inteiro(valor) {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return Number.isInteger(n) ? n : null;
}

function decimal(valor) {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/**
 * Valida e normaliza uma configuração. Aceita números ou textos ("72,5").
 * @returns {{ valido: boolean, erros: string[], valores: Omit<ConfigAtleta, 'id'>|null }}
 */
export function validarConfigAtleta(entrada) {
  const erros = [];
  const fcMax = inteiro(entrada?.fcMax);
  const fcRepouso = inteiro(entrada?.fcRepouso);
  const lthr = inteiro(entrada?.lthr);
  const pesoKg = decimal(entrada?.pesoKg);
  const alturaCm = decimal(entrada?.alturaCm);
  const { vigenteDesde, sexo } = entrada ?? {};

  if (!dataIsoValida(vigenteDesde)) erros.push('Informe a data de início da vigência.');

  const L = LIMITES_CONFIG;
  if (fcMax === null || fcMax < L.fcMax.min || fcMax > L.fcMax.max) {
    erros.push(`FC máxima deve ser um número inteiro entre ${L.fcMax.min} e ${L.fcMax.max} bpm.`);
  }
  if (fcRepouso === null || fcRepouso < L.fcRepouso.min || fcRepouso > L.fcRepouso.max) {
    erros.push(`FC de repouso deve ser um número inteiro entre ${L.fcRepouso.min} e ${L.fcRepouso.max} bpm.`);
  }
  if (fcMax !== null && fcRepouso !== null && fcRepouso >= fcMax) {
    erros.push('A FC de repouso deve ser menor que a FC máxima.');
  }
  if (lthr === null) {
    erros.push('Informe o LTHR (FC no limiar) em bpm, como número inteiro.');
  } else if (fcMax !== null && fcRepouso !== null && (lthr <= fcRepouso || lthr > fcMax)) {
    erros.push('O LTHR deve ficar entre a FC de repouso e a FC máxima.');
  }
  if (sexo !== SEXOS.MASCULINO && sexo !== SEXOS.FEMININO) erros.push('Informe o sexo (usado na constante do TRIMP).');
  if (pesoKg === null || pesoKg < L.pesoKg.min || pesoKg > L.pesoKg.max) {
    erros.push(`Peso deve estar entre ${L.pesoKg.min} e ${L.pesoKg.max} kg.`);
  }
  if (alturaCm === null || alturaCm < L.alturaCm.min || alturaCm > L.alturaCm.max) {
    erros.push(`Altura deve estar entre ${L.alturaCm.min} e ${L.alturaCm.max} cm.`);
  }

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { vigenteDesde, fcMax, fcRepouso, lthr, sexo, pesoKg, alturaCm } };
}

/**
 * Configuração vigente em uma data: a de maior `vigenteDesde` menor ou igual a ela.
 * Datas yyyy-mm-dd comparam corretamente como texto.
 * @param {ConfigAtleta[]} configs
 * @param {string} data yyyy-mm-dd
 * @returns {ConfigAtleta|null}
 */
export function configVigenteEm(configs, data) {
  let escolhida = null;
  for (const config of configs ?? []) {
    if (config.vigenteDesde <= data && (!escolhida || config.vigenteDesde > escolhida.vigenteDesde)) {
      escolhida = config;
    }
  }
  return escolhida;
}
