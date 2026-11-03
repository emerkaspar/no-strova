import { arredondarHrss, estimarHrssPorZona, LIMITE_HRSS_POR_HORA, ZONAS } from './hrss.js';

/**
 * Calibração da estimativa de HRSS dos treinos planejados com o histórico do próprio atleta.
 *
 * A fórmula (FC média presumida da zona) é teórica e subestima treinos variados (o TRIMP é convexo). A calibração
 * olha as atividades já feitas, com FC real, e guarda o HRSS por hora de cada par esporte × zona. Funções puras,
 * sem Firebase e sem DOM; o servidor mantém o documento e o cliente só lê.
 *
 * Documento: { chaves: { [`${esporte}_${zona}`]: { n, mediana, amostras: [{ id, data, v }] } } }
 *   v = HRSS por hora de uma atividade; `mediana` e `n` são derivados de `amostras` (as mais recentes).
 */

/** Atividades mais curtas que isso não entram (HRSS/h de treino curto é ruidoso). */
export const DURACAO_MINIMA_CALIBRACAO_S = 20 * 60;
/** Quantas amostras (as mais recentes) cada par esporte × zona guarda. */
export const MAX_AMOSTRAS_POR_CHAVE = 30;
/** Com menos amostras que isso, vale só a fórmula. */
export const MIN_AMOSTRAS_CALIBRACAO = 3;
/** Peso da calibração = n / (n + K): com poucas amostras a fórmula ainda pesa bastante. */
export const AMOSTRAS_PARA_METADE = 5;

/** Razão FC média / LTHR fora desta faixa não vira zona (passeio muito leve ou FC incoerente). */
const FAIXA_RAZAO = { min: 0.6, max: 1.12 };

export const chaveDeCalibracao = (esporte, zona) => `${esporte}_${zona}`;

/** Zona cuja FC presumida (fração do LTHR) está mais perto da FC média; null se fora da faixa plausível. */
export function zonaDaFcMedia(fcMedia, lthr) {
  if (!Number.isFinite(fcMedia) || !Number.isFinite(lthr) || lthr <= 0) return null;
  const razao = fcMedia / lthr;
  if (razao < FAIXA_RAZAO.min || razao > FAIXA_RAZAO.max) return null;
  let melhor = null;
  for (const [zona, def] of Object.entries(ZONAS)) {
    const distancia = Math.abs(razao - def.fracaoLthr);
    if (melhor === null || distancia < melhor.distancia) melhor = { zona, distancia };
  }
  return melhor.zona;
}

/**
 * Amostra de calibração de uma atividade, ou null se ela não serve: só HRSS calculado pela FC real (não o estimado
 * pela zona nem o informado), com tempo mínimo e sem alerta de HRSS anormal.
 * @param {{ id: string, esporte: string, data: string, hrss?: number|null, hrssOrigem?: string|null, fcMedia?: number|null, tempoMovimentoS?: number, duracaoS?: number, alertas?: string[] }} atividade
 * @param {{ lthr: number }|null} config configuração vigente na data da atividade (define a zona)
 * @returns {{ chave: string, id: string, data: string, v: number }|null}
 */
export function amostraDeCalibracao(atividade, config) {
  if (!atividade || !config) return null;
  if (atividade.hrssOrigem !== 'fc' || !Number.isFinite(atividade.hrss) || atividade.hrss <= 0) return null;
  if ((atividade.alertas ?? []).includes('hrssAnormal')) return null;
  const tempo = Number.isFinite(atividade.tempoMovimentoS) ? atividade.tempoMovimentoS : atividade.duracaoS;
  if (!Number.isFinite(tempo) || tempo < DURACAO_MINIMA_CALIBRACAO_S) return null;
  const zona = zonaDaFcMedia(atividade.fcMedia, config.lthr);
  if (zona === null || !atividade.esporte) return null;
  const v = atividade.hrss / (tempo / 3600);
  if (!(v > 0) || v > LIMITE_HRSS_POR_HORA) return null;
  return { chave: chaveDeCalibracao(atividade.esporte, zona), id: atividade.id, data: atividade.data, v: Math.round(v * 100) / 100 };
}

export function mediana(valores) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function consolidar(amostras) {
  const recentes = [...amostras]
    .sort((a, b) => (a.data === b.data ? (a.id < b.id ? 1 : -1) : a.data < b.data ? 1 : -1))
    .slice(0, MAX_AMOSTRAS_POR_CHAVE);
  return { n: recentes.length, mediana: Math.round(mediana(recentes.map((x) => x.v)) * 100) / 100, amostras: recentes };
}

/**
 * Nova calibração depois de uma mudança em uma atividade: tira a amostra antiga (pelo id) e põe a nova, se houver.
 * Não altera o objeto recebido.
 * @param {{ chaves?: Record<string, any> }|null} atual
 * @param {{ removerId?: string, amostra?: { chave: string, id: string, data: string, v: number }|null }} mudanca
 */
export function atualizarCalibracao(atual, { removerId, amostra } = {}) {
  const porChave = new Map();
  for (const [chave, entrada] of Object.entries(atual?.chaves ?? {})) {
    porChave.set(chave, (entrada.amostras ?? []).filter((a) => a.id !== removerId && a.id !== amostra?.id));
  }
  if (amostra) {
    porChave.set(amostra.chave, [...(porChave.get(amostra.chave) ?? []), { id: amostra.id, data: amostra.data, v: amostra.v }]);
  }
  const chaves = {};
  for (const [chave, amostras] of porChave) {
    if (amostras.length > 0) chaves[chave] = consolidar(amostras);
  }
  return { chaves };
}

/** Calibração a partir de todas as amostras (reconstrução do zero). */
export function reconstruirCalibracao(amostras) {
  const porChave = new Map();
  for (const a of amostras) {
    if (!a) continue;
    porChave.set(a.chave, [...(porChave.get(a.chave) ?? []), { id: a.id, data: a.data, v: a.v }]);
  }
  const chaves = {};
  for (const [chave, lista] of porChave) chaves[chave] = consolidar(lista);
  return { chaves };
}

/**
 * HRSS por hora de um par esporte × zona: mistura da mediana do atleta com a fórmula, com peso n / (n + K).
 * Sem amostras suficientes (ou sem calibração), só a fórmula.
 * @returns {{ valor: number|null, formula: number|null, calibrado: boolean, n: number, peso: number }}
 */
export function hrssPorHoraCalibrado({ esporte, zona, config, calibracao }) {
  const formula = config ? estimarHrssPorZona({ zona, duracaoS: 3600, config }) : null;
  const entrada = calibracao?.chaves?.[chaveDeCalibracao(esporte, zona)];
  if (formula === null || !entrada || !(entrada.n >= MIN_AMOSTRAS_CALIBRACAO) || !Number.isFinite(entrada.mediana)) {
    return { valor: formula, formula, calibrado: false, n: entrada?.n ?? 0, peso: 0 };
  }
  const peso = entrada.n / (entrada.n + AMOSTRAS_PARA_METADE);
  return { valor: peso * entrada.mediana + (1 - peso) * formula, formula, calibrado: true, n: entrada.n, peso };
}

/**
 * Estimativa de HRSS de um treino planejado, com calibração quando houver.
 * @returns {{ valor: number|null, calibrado: boolean, n: number, formula: number|null }} `formula` é o valor sem calibração
 */
export function estimarEstresseCalibrado({ esporte, zona, duracaoMin, config, calibracao }) {
  if (!config || !(duracaoMin > 0)) return { valor: null, calibrado: false, n: 0, formula: null };
  const porHora = hrssPorHoraCalibrado({ esporte, zona, config, calibracao });
  // a fórmula é calculada direto na duração (sem passar pelo HRSS/h), para bater com a estimativa sem calibração
  const formula = arredondarHrss(estimarHrssPorZona({ zona, duracaoS: duracaoMin * 60, config }));
  return {
    valor: porHora.calibrado ? arredondarHrss(porHora.valor * (duracaoMin / 60)) : formula,
    calibrado: porHora.calibrado,
    n: porHora.n,
    formula,
  };
}
