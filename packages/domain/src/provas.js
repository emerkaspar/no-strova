import { ESPORTES_VALIDOS } from './atividade.js';
import { diasEntre } from './forma.js';
import { dataIsoValida } from './usuarios.js';

/**
 * Eventos (provas, passeios, desafios) do atleta, com prioridade A/B/C como no TrainingPeaks. O evento A é o objetivo da temporada e
 * guia o plano anual (ver planoAnual.js). Funções puras, sem Firebase e sem DOM.
 */
export const PRIORIDADES_PROVA = Object.freeze({
  A: { rotulo: 'A · Principal', descricao: 'O objetivo da temporada: a preparação faz você chegar descansado nele.' },
  B: { rotulo: 'B · Importante', descricao: 'Evento relevante, com polimento curto.' },
  C: { rotulo: 'C · Treino', descricao: 'Serve de treino: sem polimento relevante.' },
});

export const LIMITES_PROVA = Object.freeze({
  nome: { min: 3, max: 60 },
  local: { max: 80 },
  distanciaKm: { min: 0.1, max: 1000 },
  metaTempoS: { min: 60, max: 48 * 3600 },
  formaAlvo: { min: -60, max: 60 },
  /** A prova pode ficar até 2 anos à frente. */
  diasAFrente: 730,
});

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Lê um tempo digitado: "h:mm:ss" ou "mm:ss" (ex.: "1:45:30", "45:00"). Retorna segundos ou null se inválido.
 * @param {unknown} texto
 */
export function lerTempoDaProva(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto) : null;
  if (typeof texto !== 'string') return null;
  const partes = texto.trim().split(':');
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const n = partes.map(Number);
  if (n.slice(1).some((v) => v > 59)) return null;
  return partes.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

/** Segundos em "h:mm:ss" (com hora) ou "mm:ss". */
export function formatarTempoDaProva(segundos) {
  if (!Number.isFinite(segundos) || segundos < 0) return '';
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const resto = s % 60;
  const dois = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(resto)}` : `${dois(m)}:${dois(resto)}`;
}

/**
 * Valida e normaliza o formulário da prova. Distância, meta de tempo, local e Forma-alvo são opcionais (viram null).
 * @param {{ nome: unknown, data: unknown, esporte: unknown, prioridade: unknown, distanciaKm?: unknown, metaTempo?: unknown, local?: unknown, formaAlvo?: unknown }} entrada
 *   `metaTempo`: "h:mm:ss" ou "mm:ss"
 * @param {string} hoje yyyy-mm-dd
 * @returns {{ valido: boolean, erros: string[], valores: object|null }}
 */
export function validarProva(entrada, hoje) {
  const erros = [];
  const e = entrada ?? {};
  const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
  const { nome: ln, local: ll, distanciaKm: ld, metaTempoS: lt, formaAlvo: lf } = LIMITES_PROVA;

  if (nome.length < ln.min || nome.length > ln.max) erros.push(`O nome do evento deve ter de ${ln.min} a ${ln.max} caracteres.`);
  if (!dataIsoValida(e.data)) erros.push('Informe a data do evento.');
  else if (e.data < hoje) erros.push('A data do evento não pode estar no passado.');
  else if (diasEntre(hoje, e.data) > LIMITES_PROVA.diasAFrente) erros.push('O evento deve ficar nos próximos 2 anos.');
  if (!ESPORTES_VALIDOS.includes(e.esporte)) erros.push('Escolha o esporte do evento.');
  if (!Object.keys(PRIORIDADES_PROVA).includes(e.prioridade)) erros.push('Escolha a prioridade do evento (A, B ou C).');

  let distanciaKm = null;
  if (!vazio(e.distanciaKm)) {
    distanciaKm = numero(e.distanciaKm);
    if (distanciaKm === null || distanciaKm < ld.min || distanciaKm > ld.max) erros.push(`A distância deve ficar entre ${ld.min} e ${ld.max} km.`);
    else distanciaKm = Math.round(distanciaKm * 100) / 100;
  }

  let metaTempoS = null;
  if (!vazio(e.metaTempo)) {
    metaTempoS = lerTempoDaProva(e.metaTempo);
    if (metaTempoS === null || metaTempoS < lt.min || metaTempoS > lt.max) erros.push('Informe a meta de tempo como h:mm:ss (ex.: 1:45:30) ou mm:ss.');
  }

  const local = typeof e.local === 'string' ? e.local.trim() : '';
  if (local.length > ll.max) erros.push(`O local deve ter até ${ll.max} caracteres.`);

  let formaAlvo = null;
  if (!vazio(e.formaAlvo)) {
    formaAlvo = numero(e.formaAlvo);
    if (formaAlvo === null || formaAlvo < lf.min || formaAlvo > lf.max) erros.push(`A Forma-alvo deve ficar entre ${lf.min} e ${lf.max}.`);
    else formaAlvo = Math.round(formaAlvo * 10) / 10;
  }

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return {
    valido: true,
    erros,
    valores: { nome, data: e.data, esporte: e.esporte, prioridade: e.prioridade, distanciaKm, metaTempoS, local: local || null, formaAlvo },
  };
}

/** Provas de hoje em diante, da mais próxima para a mais distante. */
export function provasFuturas(provas, hoje) {
  return (provas ?? []).filter((p) => p.data >= hoje).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/**
 * A prova que guia o plano anual: a prova A mais próxima; sem A, a B; sem B, a C. Null sem provas futuras.
 */
export function provaDoPlano(provas, hoje) {
  const futuras = provasFuturas(provas, hoje);
  for (const prioridade of ['A', 'B', 'C']) {
    const achada = futuras.find((p) => p.prioridade === prioridade);
    if (achada) return achada;
  }
  return null;
}
