/**
 * Plano de treino: estimativa de estresse, projeção do Fitness/Fadiga/Forma, meta de forma e vínculo
 * entre treino planejado e atividade realizada. Funções puras, sem Firebase e sem DOM.
 */
import { estimarEstresseCalibrado } from './calibracao.js';
import { ESPORTES_VALIDOS } from './atividade.js';
import { configVigenteEm } from './configAtleta.js';
import { calcularSerieForma, diasEntre, somarDias } from './forma.js';
import { arredondarHrss, estimarHrssPorZona, ZONAS } from './hrss.js';
import { dataIsoValida } from './usuarios.js';

export const STATUS_TREINO = Object.freeze({ PLANEJADO: 'planejado', REALIZADO: 'realizado', PULADO: 'pulado' });

export const LIMITES_TREINO = Object.freeze({
  duracaoMin: { min: 5, max: 1440 },
  estresseMax: 2000,
  observacoes: 500,
});

/** A projeção vai até o último treino planejado (ou a data da meta) mais esta margem... */
export const MARGEM_PROJECAO_DIAS = 14;
/** ...limitada a este horizonte a partir de hoje (a meta, se for mais longe, estende a série). */
export const HORIZONTE_MAXIMO_DIAS = 90;
/** Quantos pontos de Forma de diferença ainda contam como "chega lá". */
export const TOLERANCIA_META = 3;
export const LIMITES_META = Object.freeze({ formaMin: -60, formaMax: 60 });

/**
 * @typedef {object} TreinoPlanejado
 * @property {string} [id]
 * @property {string} data yyyy-mm-dd
 * @property {string} esporte
 * @property {number} duracaoMin
 * @property {string} zona Z1–Z5
 * @property {number|null} [estresseEstimado] gravado ao salvar (referência)
 * @property {number|null} [estresseManual] sobrescreve a estimativa
 * @property {string} [observacoes]
 * @property {string} status planejado | realizado | pulado
 * @property {string|null} [atividadeId]
 */

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null; // campo vazio não é zero
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * HRSS estimado de um treino pela zona e duração, com a configuração de FC informada. Com `calibracao` (o resumo do
 * histórico do atleta, ver calibracao.js) e amostras suficientes para o esporte e a zona, a estimativa é calibrada;
 * senão vale a fórmula.
 */
export function estimarEstresseTreino({ zona, duracaoMin, config, esporte, calibracao }) {
  if (!config || !(duracaoMin > 0)) return null;
  if (calibracao) {
    const calibrada = estimarEstresseCalibrado({ esporte, zona, duracaoMin, config, calibracao });
    if (calibrada.calibrado) return calibrada.valor;
  }
  return arredondarHrss(estimarHrssPorZona({ zona, duracaoS: duracaoMin * 60, config }));
}

/**
 * Estresse que o treino entra na projeção: o informado pelo usuário; senão a estimativa pela configuração
 * vigente na data do treino (recalculada, para acompanhar mudanças de LTHR); senão o valor gravado; senão 0.
 * @param {TreinoPlanejado} treino
 * @param {import('./configAtleta.js').ConfigAtleta[]} configs
 */
export function estresseDoTreino(treino, configs, calibracao = null) {
  if (Number.isFinite(treino.estresseManual)) return treino.estresseManual;
  const estimado = estimarEstresseTreino({
    zona: treino.zona,
    duracaoMin: treino.duracaoMin,
    config: configVigenteEm(configs, treino.data),
    esporte: treino.esporte,
    calibracao,
  });
  if (estimado !== null) return estimado;
  return Number.isFinite(treino.estresseEstimado) ? treino.estresseEstimado : 0;
}

/**
 * Valida e normaliza o formulário de treino planejado.
 * @returns {{ valido: boolean, erros: string[], valores: object|null }}
 */
export function validarTreinoPlanejado(entrada) {
  const erros = [];
  const { esporte, data, zona } = entrada ?? {};

  if (!ESPORTES_VALIDOS.includes(esporte)) erros.push('Escolha o esporte.');
  if (!dataIsoValida(data) || data < '2000-01-01' || data > '2100-12-31') erros.push('Informe a data do treino.');

  const duracao = numero(entrada?.duracaoMin);
  const { min, max } = LIMITES_TREINO.duracaoMin;
  if (duracao === null || !Number.isInteger(duracao) || duracao < min || duracao > max) {
    erros.push(`Informe a duração em minutos inteiros, de ${min} a ${max}.`);
  }
  if (!Object.keys(ZONAS).includes(zona)) erros.push('Escolha a zona predominante (Z1 a Z5).');

  let estresseManual = null;
  const bruto = entrada?.estresseManual;
  if (bruto !== undefined && bruto !== null && bruto !== '') {
    const n = numero(bruto);
    if (n === null || n <= 0 || n > LIMITES_TREINO.estresseMax) erros.push(`O estresse informado deve estar entre 1 e ${LIMITES_TREINO.estresseMax}.`);
    else estresseManual = Math.round(n * 100) / 100;
  }

  const observacoes = typeof entrada?.observacoes === 'string' ? entrada.observacoes.trim() : '';
  if (observacoes.length > LIMITES_TREINO.observacoes) erros.push(`As observações passam de ${LIMITES_TREINO.observacoes} caracteres.`);

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { esporte, data, duracaoMin: duracao, zona, estresseManual, observacoes } };
}

/** Treino que ficou para trás sem ser feito (e sem vínculo nem "pulado"). */
export function treinoNaoRealizado(treino, hoje) {
  return treino.status === STATUS_TREINO.PLANEJADO && treino.data < hoje;
}

function somarPorDia(itens) {
  const mapa = new Map();
  for (const { data, estresse } of itens) {
    if (Number.isFinite(estresse) && estresse > 0) mapa.set(data, (mapa.get(data) ?? 0) + estresse);
  }
  return mapa;
}

/**
 * Estresse de cada dia para a projeção, pelas regras do produto:
 *  - dias passados: só o realizado;
 *  - hoje: o maior entre o realizado e o planejado;
 *  - dias futuros: o planejado.
 * Só treinos com status "planejado" contam: o vinculado (realizado) já está no realizado e o pulado não soma.
 * @param {{ realizado: Array<{data: string, estresse: number}>, treinos: TreinoPlanejado[], configs: any[], hoje: string }} entrada
 * @returns {Array<{ data: string, estresse: number }>}
 */
export function estressesParaProjecao({ realizado, treinos, configs, hoje, calibracao = null }) {
  const feito = somarPorDia((realizado ?? []).filter((r) => r.data <= hoje));
  const previsto = somarPorDia(
    (treinos ?? [])
      .filter((t) => t.status === STATUS_TREINO.PLANEJADO && t.data >= hoje)
      .map((t) => ({ data: t.data, estresse: estresseDoTreino(t, configs, calibracao) })),
  );

  const resultado = [];
  for (const data of new Set([...feito.keys(), ...previsto.keys()])) {
    const r = feito.get(data) ?? 0;
    const p = previsto.get(data) ?? 0;
    const estresse = data < hoje ? r : data === hoje ? Math.max(r, p) : p;
    if (estresse > 0) resultado.push({ data, estresse });
  }
  return resultado;
}

/**
 * Data final da projeção: o último treino planejado (ou a meta) mais 14 dias, com teto de 90 dias a partir de
 * hoje. Uma meta mais distante estende a série até ela, para poder ser avaliada. Sem plano nem meta, é hoje.
 */
export function horizonteDaProjecao({ treinos, meta, hoje }) {
  const marcos = (treinos ?? []).filter((t) => t.status === STATUS_TREINO.PLANEJADO && t.data >= hoje).map((t) => t.data);
  const metaFutura = meta?.ativa && meta.dataAlvo >= hoje ? meta.dataAlvo : null;
  if (metaFutura) marcos.push(metaFutura);
  if (marcos.length === 0) return hoje;

  const ultimo = marcos.reduce((a, b) => (b > a ? b : a));
  const teto = somarDias(hoje, HORIZONTE_MAXIMO_DIAS);
  const alvo = somarDias(ultimo, MARGEM_PROJECAO_DIAS);
  const horizonte = alvo > teto ? teto : alvo;
  return metaFutura && metaFutura > horizonte ? metaFutura : horizonte;
}

/**
 * Série de Fitness/Fadiga/Forma com a projeção do plano. Cada dia ganha `projetado` (depois de hoje).
 * @returns {Array<import('./forma.js').DiaForma & { projetado: boolean }>}
 */
export function serieComProjecao({ realizado, treinos, configs, hoje, ate, calibracao = null }) {
  const estresses = estressesParaProjecao({ realizado, treinos, configs, hoje, calibracao });
  const limite = ate && ate > hoje ? ate : hoje;
  // calcularSerieForma nunca termina antes do último estresse: corta no limite pedido
  return calcularSerieForma(estresses, { ate: limite })
    .filter((d) => d.data <= limite)
    .map((d) => ({ ...d, projetado: d.data > hoje }));
}

/**
 * @typedef {object} MetaForma
 * @property {string} [id]
 * @property {number} formaAlvo
 * @property {string} dataAlvo yyyy-mm-dd
 * @property {boolean} ativa
 */

/** Valida o formulário da meta de forma. */
export function validarMetaForma(entrada, hoje) {
  const erros = [];
  const forma = numero(entrada?.formaAlvo);
  if (forma === null || forma < LIMITES_META.formaMin || forma > LIMITES_META.formaMax) {
    erros.push(`Informe a Forma desejada, de ${LIMITES_META.formaMin} a ${LIMITES_META.formaMax}.`);
  }
  const data = entrada?.dataAlvo;
  if (!dataIsoValida(data)) erros.push('Informe a data da meta.');
  else if (data < hoje) erros.push('A data da meta não pode estar no passado.');
  else if (diasEntre(hoje, data) > 365) erros.push('A data da meta deve ficar nos próximos 365 dias.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { formaAlvo: Math.round(forma * 10) / 10, dataAlvo: data } };
}

/**
 * Compara a Forma do dia da meta (projetada, se a data é futura) com o alvo.
 *  - `atinge`: dentro de ±3 pontos; `abaixo`: Forma menor que o alvo (carga demais, falta descanso);
 *    `acima`: Forma maior que o alvo (carga de menos);
 *  - `sem-dados`: a série não cobre a data da meta.
 * @param {Array<import('./forma.js').DiaForma & { projetado?: boolean }>} serie
 * @param {MetaForma|null|undefined} meta
 * @param {string} hoje
 */
export function avaliarMeta(serie, meta, hoje) {
  if (!meta) return null;
  const dia = serie.find((d) => d.data === meta.dataAlvo);
  const base = { formaAlvo: meta.formaAlvo, dataAlvo: meta.dataAlvo, dias: diasEntre(hoje, meta.dataAlvo) };
  if (!dia) return { ...base, estado: 'sem-dados', formaProjetada: null, diferenca: null };
  const diferenca = dia.forma - meta.formaAlvo;
  const estado = Math.abs(diferenca) <= TOLERANCIA_META ? 'atinge' : diferenca < 0 ? 'abaixo' : 'acima';
  return { ...base, estado, formaProjetada: dia.forma, diferenca };
}

/**
 * Sugere vínculos: treino ainda "planejado" e atividade do mesmo dia e do mesmo esporte, sem repetir atividade.
 * O usuário confirma cada um.
 * @param {TreinoPlanejado[]} treinos
 * @param {Array<{ id: string, data: string, esporte: string }>} atividades
 * @returns {Array<{ treinoId: string, atividadeId: string }>}
 */
export function sugerirVinculos(treinos, atividades) {
  const usadas = new Set((treinos ?? []).filter((t) => t.atividadeId).map((t) => t.atividadeId));
  const sugestoes = [];
  for (const t of treinos ?? []) {
    if (t.status !== STATUS_TREINO.PLANEJADO || t.atividadeId) continue;
    const candidata = (atividades ?? []).find((a) => a.data === t.data && a.esporte === t.esporte && !usadas.has(a.id));
    if (candidata) {
      sugestoes.push({ treinoId: t.id, atividadeId: candidata.id });
      usadas.add(candidata.id);
    }
  }
  return sugestoes;
}

/** Planejado × realizado de um treino vinculado. */
export function compararTreino(treino, atividade, configs, calibracao = null) {
  const planejado = estresseDoTreino(treino, configs, calibracao);
  const realizado = Number.isFinite(atividade?.hrss) ? atividade.hrss : null;
  return {
    planejado,
    realizado,
    diferenca: realizado === null ? null : Math.round((realizado - planejado) * 10) / 10,
    duracaoPlanejadaMin: treino.duracaoMin,
    duracaoRealizadaMin: Number.isFinite(atividade?.duracaoS) ? Math.round(atividade.duracaoS / 60) : null,
  };
}
