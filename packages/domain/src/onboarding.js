import { LIMITES_CONFIG } from './configAtleta.js';
import { calcularIdade, dataIsoValida } from './usuarios.js';

/**
 * Wizard de perfil (primeiro acesso e "Perfil de treino"): estimativas para quem não sabe os próprios números, a
 * rotina semanal e o estado do onboarding. Funções puras, sem Firebase e sem DOM.
 */

export const ESTADOS_ONBOARDING = Object.freeze({ CONCLUIDO: 'concluido', PULADO: 'pulado' });

export const LIMITES_ROTINA = Object.freeze({ horasMin: 1, horasMax: 25, minutosDiaMin: 15, minutosDiaMax: 360 });

/**
 * Tempo que o atleta tem em cada dia de treino (`minutosPorDia`, mapa dia → minutos; dias 0 = segunda … 6 = domingo).
 * Só vale para os dias de treino; devolve null quando nenhum dia tem tempo informado e `erro` se algum dia de treino ficou sem tempo
 * (ou fora de 15 min a 6 h). `total` é a soma em minutos.
 * @param {any} bruto
 * @param {number[]} diasTreino
 * @returns {{ mapa: Record<string, number>|null, total: number, erro: string|null }}
 */
export function lerMinutosPorDia(bruto, diasTreino) {
  if (!bruto || typeof bruto !== 'object') return { mapa: null, total: 0, erro: null };
  const { minutosDiaMin, minutosDiaMax } = LIMITES_ROTINA;
  const mapa = {};
  let total = 0;
  for (const d of diasTreino) {
    const m = numero(bruto[d] ?? bruto[String(d)]);
    if (m === null || !Number.isInteger(m) || m < minutosDiaMin || m > minutosDiaMax) {
      return { mapa: null, total: 0, erro: `Informe o tempo de cada dia de treino, de ${minutosDiaMin} minutos a ${minutosDiaMax / 60} horas.` };
    }
    mapa[String(d)] = m;
    total += m;
  }
  return { mapa, total, erro: null };
}

export const ESPORTES_PRINCIPAIS = Object.freeze(['ciclismo', 'corrida', 'ambos']);

/** Escolha do usuário sobre enviar treinos ao Garmin (pelo intervals.icu): usa, não usa ou decide depois. */
export const USOS_DO_GARMIN = Object.freeze(['sim', 'nao', 'depois']);

/** A escolha do Garmin, ou null se não for uma das aceitas. */
export function validarUsoGarmin(valor) {
  return USOS_DO_GARMIN.includes(valor) ? valor : null;
}

/** Fração da FC máxima usada como LTHR quando o usuário ainda não fez o teste (padrão sugerido). */
export const FRACAO_LTHR_ESTIMADA = 0.9;

/**
 * FC máxima estimada pela idade (Tanaka: 208 − 0,7 × idade), arredondada e dentro dos limites aceitos.
 * Null sem data de nascimento válida.
 * @param {string|null|undefined} dataNascimento yyyy-mm-dd
 * @param {Date} [hoje]
 */
export function estimarFcMax(dataNascimento, hoje = new Date()) {
  if (!dataIsoValida(dataNascimento)) return null;
  const idade = calcularIdade(dataNascimento, hoje);
  const { min, max } = LIMITES_CONFIG.fcMax;
  return Math.min(max, Math.max(min, Math.round(208 - 0.7 * idade)));
}

/**
 * LTHR estimado (90% da FC máxima). Null se a FC máxima é inválida ou se o resultado não ficaria acima da FC de repouso.
 * @param {number} fcMax
 * @param {number|null} [fcRepouso]
 */
export function estimarLthr(fcMax, fcRepouso = null) {
  if (!Number.isFinite(fcMax) || fcMax < LIMITES_CONFIG.fcMax.min) return null;
  const lthr = Math.round(fcMax * FRACAO_LTHR_ESTIMADA);
  if (Number.isFinite(fcRepouso) && lthr <= fcRepouso) return null;
  return lthr;
}

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Valida a rotina semanal. Dias de 0 (segunda) a 6 (domingo); o longão é um dos dias de treino (ou nenhum).
 * @returns {{ valido: boolean, erros: string[], valores: { diasTreino: number[], diaLongao: number|null, horasSemana: number, minutosPorDia: Record<string, number>|null, esportePrincipal: string }|null }}
 */
export function validarRotina(entrada) {
  const erros = [];
  const diasBrutos = Array.isArray(entrada?.diasTreino) ? entrada.diasTreino.map(numero) : [];
  const diasTreino = [...new Set(diasBrutos)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (diasTreino.length === 0) erros.push('Escolha pelo menos um dia da semana para treinar.');

  const longaoBruto = numero(entrada?.diaLongao);
  const diaLongao = longaoBruto === null ? null : longaoBruto;
  if (diaLongao !== null && !diasTreino.includes(diaLongao)) erros.push('O dia do longão precisa ser um dos dias de treino.');

  // com o tempo de cada dia, o total semanal é a soma deles (limitado ao máximo de horas por semana)
  const porDia = lerMinutosPorDia(entrada?.minutosPorDia, diasTreino);
  if (porDia.erro && diasTreino.length > 0) erros.push(porDia.erro);
  const { horasMin, horasMax } = LIMITES_ROTINA;
  let horas = numero(entrada?.horasSemana);
  if (porDia.mapa) horas = Math.min(horasMax, Math.max(horasMin, Math.round((porDia.total / 60) * 2) / 2));
  else if (horas === null || horas < horasMin || horas > horasMax) erros.push(`Informe de ${horasMin} a ${horasMax} horas de treino por semana.`);

  const esportePrincipal = entrada?.esportePrincipal ?? 'ambos';
  if (!ESPORTES_PRINCIPAIS.includes(esportePrincipal)) erros.push('Escolha ciclismo, corrida ou os dois.');

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { diasTreino, diaLongao, horasSemana: Math.round(horas * 2) / 2, minutosPorDia: porDia.mapa, esportePrincipal } };
}

/**
 * Situação do perfil de treino do usuário:
 *  - `ok`: concluiu o wizard ou já tem configuração de FC (quem já usa o app não é incomodado);
 *  - `pulado`: fechou o wizard sem concluir e ainda não tem configuração (a faixa do Início lembra);
 *  - `novo`: nunca viu o wizard (abre sozinho no primeiro acesso).
 * @param {{ preferencias?: { onboarding?: string }|null, configs?: any[] }} dados
 * @returns {'ok'|'pulado'|'novo'}
 */
export function situacaoDoPerfilDeTreino({ preferencias, configs }) {
  if (preferencias?.onboarding === ESTADOS_ONBOARDING.CONCLUIDO || (configs?.length ?? 0) > 0) return 'ok';
  return preferencias?.onboarding === ESTADOS_ONBOARDING.PULADO ? 'pulado' : 'novo';
}
