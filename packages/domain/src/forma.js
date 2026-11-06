/**
 * Fitness, Fadiga e Forma, replicando o Elevate (appcore/.../fitness-trend/shared/services/fitness.service.ts):
 *
 *   Fitness(d) = Fitness(d−1) + (estresse(d) − Fitness(d−1)) × (1 − e^(−1/42))
 *   Fadiga(d)  = Fadiga(d−1)  + (estresse(d) − Fadiga(d−1))  × (1 − e^(−1/7))
 *   Forma(d)   = Fitness(d−1) − Fadiga(d−1)        ← a Forma de hoje usa os valores de ONTEM
 *
 * A série começa um dia antes da primeira atividade, com tudo em 0. Dias sem treino têm estresse 0.
 * Funções puras, sem Firebase e sem DOM.
 */

export const DIAS_FITNESS = 42;
export const DIAS_FADIGA = 7;

const FATOR_FITNESS = 1 - Math.exp(-1 / DIAS_FITNESS);
const FATOR_FADIGA = 1 - Math.exp(-1 / DIAS_FADIGA);

/**
 * Faixas de Forma (zonas de treino do Elevate, de Joe Friel). `acimaDe` é o limite inferior exclusivo.
 */
export const FAIXAS_FORMA = Object.freeze([
  {
    id: 'transicao',
    rotulo: 'Transição',
    chip: 'Zona de transição',
    intervalo: '> +25',
    acimaDe: 25,
    descricao: 'Pausa longa (doença, lesão ou fim de temporada): o Condicionamento está caindo.',
    resumo: 'Você está descansado demais: o Condicionamento tende a cair.',
  },
  {
    id: 'freshness',
    rotulo: 'Descansado',
    chip: 'Zona descansada',
    intervalo: '+5 a +25',
    acimaDe: 5,
    descricao: 'Em forma e descansado: pronto para um evento ou para dias fortes.',
    resumo: 'Você está descansado e pronto para um evento ou dias fortes.',
  },
  {
    id: 'neutral',
    rotulo: 'Neutra',
    chip: 'Zona neutra',
    intervalo: '−10 a +5',
    acimaDe: -10,
    descricao: 'Típico de semana de descanso ou de recuperação depois de um evento ou bloco duro.',
    resumo: 'Fase de recuperação, boa para absorver o treino.',
  },
  {
    id: 'optimal',
    rotulo: 'Ótima',
    chip: 'Zona ótima',
    intervalo: '−30 a −10',
    acimaDe: -30,
    descricao: 'Zona ideal para construir Condicionamento com treino efetivo.',
    resumo: 'Você treina carregado, mas dentro da faixa ideal para evoluir.',
  },
  {
    id: 'overload',
    rotulo: 'Sobrecarga',
    chip: 'Zona de sobrecarga',
    intervalo: '< −30',
    acimaDe: Number.NEGATIVE_INFINITY,
    descricao: 'Sobrecarga: risco de excesso de treino. Descanse.',
    resumo: 'Carga acima do ideal: priorize o descanso.',
  },
]);

/** Faixa em que a Forma se encontra. */
export function faixaDaForma(forma) {
  return FAIXAS_FORMA.find((f) => forma > f.acimaDe) ?? FAIXAS_FORMA[FAIXAS_FORMA.length - 1];
}

const MS_DIA = 86400000;

/** Número de dias (inteiro) de uma data yyyy-mm-dd, sem fuso horário. */
function numeroDoDia(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Math.round(Date.UTC(ano, mes - 1, dia) / MS_DIA);
}

function diaDoNumero(numero) {
  return new Date(numero * MS_DIA).toISOString().slice(0, 10);
}

/** Soma `dias` (pode ser negativo) a uma data yyyy-mm-dd. */
export function somarDias(iso, dias) {
  return diaDoNumero(numeroDoDia(iso) + dias);
}

/** Diferença em dias entre duas datas yyyy-mm-dd (fim − início). */
export function diasEntre(inicioIso, fimIso) {
  return numeroDoDia(fimIso) - numeroDoDia(inicioIso);
}

/**
 * @typedef {object} DiaForma
 * @property {string} data yyyy-mm-dd
 * @property {number} estresse soma do HRSS do dia
 * @property {number} fitness
 * @property {number} fadiga
 * @property {number} forma Fitness(ontem) − Fadiga(ontem)
 * @property {string} faixa id de FAIXAS_FORMA
 */

/**
 * Série diária de Fitness, Fadiga e Forma.
 * @param {Array<{ data: string, estresse: number }>} estresseDiario dias com treino, em qualquer ordem
 * @param {{ ate?: string }} [opcoes] última data da série (padrão: a do último treino); se for depois
 *   do último treino, a série segue com estresse 0 (Fitness e Fadiga decaem)
 * @returns {DiaForma[]} vazio quando não há treino
 */
export function calcularSerieForma(estresseDiario, { ate } = {}) {
  const porDia = new Map();
  for (const { data, estresse } of estresseDiario ?? []) {
    if (Number.isFinite(estresse) && estresse > 0) porDia.set(data, (porDia.get(data) ?? 0) + estresse);
  }
  if (porDia.size === 0) return [];

  const datas = [...porDia.keys()].sort();
  const inicio = numeroDoDia(datas[0]) - 1; // dia anterior à primeira atividade
  const fim = Math.max(numeroDoDia(ate ?? datas[datas.length - 1]), numeroDoDia(datas[datas.length - 1]));

  const serie = [];
  let fitness = 0;
  let fadiga = 0;
  for (let n = inicio; n <= fim; n++) {
    const data = diaDoNumero(n);
    const estresse = porDia.get(data) ?? 0;
    let forma = 0;
    if (n > inicio) {
      forma = fitness - fadiga;
      fitness += (estresse - fitness) * FATOR_FITNESS;
      fadiga += (estresse - fadiga) * FATOR_FADIGA;
    }
    serie.push({ data, estresse, fitness, fadiga, forma, faixa: faixaDaForma(forma).id });
  }
  return serie;
}

/** Recorta a série aos últimos `dias` dias (contando o último dia). `dias` nulo devolve tudo. */
export function recortarSerie(serie, dias) {
  if (!dias || serie.length <= dias) return serie;
  return serie.slice(serie.length - dias);
}
