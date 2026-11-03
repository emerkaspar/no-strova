import { SEXOS } from './hrss.js';

/**
 * Gasto calórico estimado por FC (Keytel et al., 2005), em kcal.
 * Só vale para exercício aeróbico com FC; é sempre uma ESTIMATIVA e deve ser rotulada assim.
 *
 *   homens:   kcal/min = (−55,0969 + 0,6309·FC + 0,1988·peso + 0,2017·idade) / 4,184
 *   mulheres: kcal/min = (−20,4022 + 0,4472·FC − 0,1263·peso + 0,074·idade) / 4,184
 *
 * @returns {number|null} null quando falta dado; nunca negativo
 */
export function caloriasKeytel({ fcMedia, pesoKg, idade, sexo, duracaoS }) {
  if (![fcMedia, pesoKg, idade, duracaoS].every((n) => Number.isFinite(n)) || fcMedia <= 0 || duracaoS <= 0) {
    return null;
  }
  const porMinuto =
    sexo === SEXOS.FEMININO
      ? (-20.4022 + 0.4472 * fcMedia - 0.1263 * pesoKg + 0.074 * idade) / 4.184
      : (-55.0969 + 0.6309 * fcMedia + 0.1988 * pesoKg + 0.2017 * idade) / 4.184;
  return Math.max(Math.round(porMinuto * (duracaoS / 60)), 0);
}
