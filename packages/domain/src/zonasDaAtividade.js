import { diasEntre, somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';
import { tempoPorZonaDeFc } from './serieDetalhe.js';

/**
 * Tempo em cada zona de FC (Z1–Z5) por atividade e por semana, para ver a distribuição do treino (leve, moderado e intenso).
 * Funções puras, sem Firebase e sem DOM.
 */
/** Versão do cálculo gravada na atividade (`zonasEm`): mude para recalcular o histórico. */
export const VERSAO_DAS_ZONAS = 1;

export const ROTULOS_DAS_ZONAS = Object.freeze(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);

/**
 * Segundos em cada zona (5 valores, Z1 a Z5) de uma atividade, pela série detalhada e pelas faixas do LTHR da configuração
 * usada nela. Null sem FC na série ou sem configuração.
 * @param {{ t: number[], fc?: Array<number|null> }|null} serie série de `series/detalhe`
 * @param {{ lthr: number, fcMax: number }|null} config
 * @returns {number[]|null}
 */
export function tempoNasZonasDaAtividade(serie, config) {
  if (!serie?.t?.length || !serie.fc || !config) return null;
  const zonas = tempoPorZonaDeFc(serie, 0, serie.t.length - 1, config);
  return zonas ? zonas.map((z) => z.segundos) : null;
}

/** O tempo por zona guardado na atividade, se for válido (5 números não negativos); senão null. */
export function zonasGuardadas(atividade) {
  const z = atividade?.tempoZonasS;
  return Array.isArray(z) && z.length === 5 && z.every((v) => Number.isFinite(v) && v >= 0) ? z : null;
}

/**
 * A atividade importada de arquivo ainda precisa calcular as zonas: nunca foram calculadas, ou foram com outra configuração
 * de FC (mudou o LTHR e o histórico foi recalculado).
 */
export function zonasPendentes(atividade) {
  if (atividade?.origem !== 'arquivo') return false;
  return atividade.zonasEm !== VERSAO_DAS_ZONAS || (atividade.zonasConfigId ?? null) !== (atividade.configIdUsada ?? null);
}

/** Tem algo derivado do arquivo para calcular (melhores esforços, série detalhada ou zonas). */
export function atividadePrecisaCompletar(atividade, { versaoDosEsforcos, versaoDoDetalhe }) {
  if (atividade?.origem !== 'arquivo') return false;
  return atividade.melhoresEsforcosEm !== versaoDosEsforcos || atividade.detalheEm !== versaoDoDetalhe || zonasPendentes(atividade);
}

const soma = (v) => v.reduce((a, b) => a + b, 0);

/**
 * Distribuição do tempo por zona nas últimas `semanas` semanas (de segunda a domingo, contando a atual).
 *  - `semanas`: uma linha por semana, da mais antiga à atual, com os segundos de cada zona;
 *  - `fracoes`: a parte de cada zona no total; `tres`: o modelo de três faixas (leve = Z1+Z2, moderado = Z3, intenso = Z4+Z5);
 *  - `atividadesComDados` / `atividadesSemDados`: quantas atividades do período têm (ou ainda não têm) o tempo por zona.
 * @param {Array<{ data: string, esporte: string }>} atividades
 * @param {{ hoje: string, semanas?: number, esporte?: string|null }} opcoes `esporte` nulo = todos
 */
export function distribuicaoPorZona(atividades, { hoje, semanas = 12, esporte = null }) {
  const inicioAtual = inicioDaSemana(hoje);
  const inicioDaJanela = somarDias(inicioAtual, -7 * (semanas - 1));
  const linhas = Array.from({ length: semanas }, (_, i) => ({ inicio: somarDias(inicioDaJanela, 7 * i), segundos: [0, 0, 0, 0, 0], total: 0 }));
  let comDados = 0;
  let semDados = 0;

  for (const a of atividades) {
    if (a.data < inicioDaJanela || a.data > hoje || (esporte && a.esporte !== esporte)) continue;
    const z = zonasGuardadas(a);
    if (!z) {
      if (zonasPendentes(a)) semDados += 1;
      continue;
    }
    comDados += 1;
    const alvo = linhas[semanas - 1 - diasEntre(inicioDaSemana(a.data), inicioAtual) / 7];
    z.forEach((s, k) => {
      alvo.segundos[k] += s;
    });
  }
  for (const l of linhas) l.total = soma(l.segundos);

  const segundos = [0, 1, 2, 3, 4].map((k) => linhas.reduce((t, l) => t + l.segundos[k], 0));
  const totalS = soma(segundos);
  const fracoes = totalS > 0 ? segundos.map((s) => s / totalS) : [0, 0, 0, 0, 0];
  const tres = totalS > 0 ? { leve: fracoes[0] + fracoes[1], moderado: fracoes[2], intenso: fracoes[3] + fracoes[4] } : null;
  return { semanas: linhas, segundos, totalS, fracoes, tres, atividadesComDados: comDados, atividadesSemDados: semDados };
}

/**
 * Leitura da distribuição em três faixas, no espírito da regra 80/20 (cerca de 80% leve e 20% moderado a intenso):
 *  - `polarizado`: pelo menos 75% leve, com 10% ou mais de intenso e pouco moderado;
 *  - `leve`: pelo menos 80% leve e quase nada de intenso (base, mas sem qualidade);
 *  - `moderado`: 30% ou mais na zona do meio (Z3), que cansa sem render tanto;
 *  - `misto`: o resto.
 * @param {{ leve: number, moderado: number, intenso: number }|null} tres
 * @returns {{ id: string, rotulo: string, texto: string }|null}
 */
export function leituraDaDistribuicao(tres) {
  if (!tres) return null;
  if (tres.moderado >= 0.3) {
    return { id: 'moderado', rotulo: 'Muito tempo no meio', texto: 'Boa parte do treino está na zona 3, que cansa sem render tanto quanto alternar treino leve e forte. Considere deixar os dias leves mais leves.' };
  }
  if (tres.leve >= 0.75 && tres.intenso >= 0.1 && tres.moderado <= 0.15) {
    return { id: 'polarizado', rotulo: 'Polarizado', texto: 'A maior parte do treino é leve, com um bloco de qualidade bem definido: perto da regra 80/20.' };
  }
  if (tres.leve >= 0.8 && tres.intenso < 0.1) {
    return { id: 'leve', rotulo: 'Base leve', texto: 'Quase tudo é leve. É ótimo para construir base; para ganhar performance, falta algum treino de qualidade.' };
  }
  return { id: 'misto', rotulo: 'Misto', texto: 'Distribuição mista entre treino leve, moderado e intenso.' };
}
