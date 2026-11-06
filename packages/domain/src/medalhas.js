import { esforcosDoEsporte } from './esforcos.js';
import { somarDias } from './forma.js';

/**
 * Medalhas de recorde pessoal (as "Peak Performances" do TrainingPeaks). Duas camadas, sempre entre atividades do mesmo esporte:
 *  - **pódio** (ouro, prata e bronze): as três melhores atividades de uma métrica em todo o histórico;
 *  - **recente** (medalha menor): o melhor dos últimos 30, 60 ou 90 dias, só quando o histórico é mais longo que a janela
 *    (senão seria o mesmo que o pódio) e só nas métricas em que a atividade não está no pódio.
 * Funções puras, sem Firebase e sem DOM.
 */
export const MEDALHAS = Object.freeze({
  ouro: { rotulo: 'Ouro', posicao: 1 },
  prata: { rotulo: 'Prata', posicao: 2 },
  bronze: { rotulo: 'Bronze', posicao: 3 },
});

/** Janelas (em dias, contando hoje) das medalhas menores, da mais longa para a mais curta. */
export const JANELAS_RECENTES = Object.freeze([90, 60, 30]);

const MEDALHA_DA_POSICAO = Object.freeze(['ouro', 'prata', 'bronze']);

/** Métricas comuns a todo esporte: o maior valor vence. Os esforços (tempo menor vence) vêm de `esforcosDoEsporte`. */
const METRICAS_DE_MAIOR_VALOR = Object.freeze([
  { id: 'distancia', campo: 'distanciaM', rotulo: 'Maior distância' },
  { id: 'duracao', campo: 'duracaoS', rotulo: 'Maior tempo' },
  { id: 'elevacao', campo: 'altimetriaM', rotulo: 'Maior elevação' },
  { id: 'hrss', campo: 'hrss', rotulo: 'Maior HRSS' },
]);

const valido = (v) => Number.isFinite(v) && v > 0;
const porData = (x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0);

/** Atividades com valor na métrica, da melhor para a pior (no empate de valor, a mais antiga na frente). */
function ranking(lista, campo, menorVence) {
  return lista.filter((a) => valido(a[campo])).sort((x, y) => (menorVence ? x[campo] - y[campo] : y[campo] - x[campo]) || porData(x, y));
}

/** Métricas com medalha em um esporte: as de maior valor e os melhores esforços (menor tempo vence). */
function metricasDoEsporte(esporte) {
  return [
    ...METRICAS_DE_MAIOR_VALOR.map((m) => ({ ...m, menorVence: false })),
    ...esforcosDoEsporte(esporte).map((e) => ({ id: e.id, campo: e.campo, rotulo: `Melhor ${e.rotulo}`, menorVence: true })),
  ];
}

/**
 * O pódio de uma métrica entre as atividades de um esporte (a base do ranking que se abre ao clicar na medalha): até três
 * atividades, da melhor para a pior, com a mesma regra de `medalhasDasAtividades` (só entra quem supera pelo menos uma outra).
 * @returns {Array<{ posicao: number, medalha: 'ouro'|'prata'|'bronze', atividade: object, valor: number }>} vazio se a métrica não existe
 */
export function podioDaMetrica(atividades, esporte, metricaId) {
  const m = metricasDoEsporte(esporte).find((x) => x.id === metricaId);
  if (!m) return [];
  const geral = ranking(atividades.filter((a) => a.esporte === esporte), m.campo, m.menorVence);
  return geral
    .slice(0, MEDALHA_DA_POSICAO.length)
    .map((a, i) => ({ posicao: i + 1, medalha: MEDALHA_DA_POSICAO[i], atividade: a, valor: a[m.campo] }))
    .filter((_, i) => i < geral.length - 1);
}

/**
 * Medalhas de cada atividade.
 *  - Pódio: ouro, prata e bronze para as três melhores de cada métrica. Só ganha quem supera pelo menos uma outra (com duas
 *    atividades só há ouro; com três, ouro e prata; com quatro ou mais, as três).
 *  - Recente: o melhor da janela de 30, 60 ou 90 dias, se houver atividade mais antiga que a janela e pelo menos duas
 *    atividades com valor nela, e se a atividade não está no pódio da métrica. Vale a janela mais longa que a atividade vence.
 * @param {Array<{ id: string, esporte: string, data: string }>} atividades
 * @param {string} hojeIso yyyy-mm-dd
 * @returns {Map<string, Array<
 *   { tipo: 'podio', metrica: string, rotulo: string, medalha: 'ouro'|'prata'|'bronze', posicao: number, total: number, valor: number } |
 *   { tipo: 'recente', metrica: string, rotulo: string, dias: number, valor: number }
 * >>} por atividade: o pódio primeiro (do ouro ao bronze) e depois as recentes (da janela mais longa à mais curta)
 */
export function medalhasDasAtividades(atividades, hojeIso) {
  const porAtividade = new Map();
  const adicionar = (id, medalha) => {
    if (!porAtividade.has(id)) porAtividade.set(id, []);
    porAtividade.get(id).push(medalha);
  };

  for (const esporte of new Set(atividades.map((a) => a.esporte))) {
    const doEsporte = atividades.filter((a) => a.esporte === esporte);
    const maisAntiga = doEsporte.reduce((m, a) => (a.data < m ? a.data : m), hojeIso);
    const metricas = metricasDoEsporte(esporte);

    for (const m of metricas) {
      const geral = ranking(doEsporte, m.campo, m.menorVence);
      const noPodio = new Set();
      geral.slice(0, MEDALHA_DA_POSICAO.length).forEach((a, i) => {
        if (i >= geral.length - 1) return; // supera pelo menos uma outra
        noPodio.add(a.id);
        adicionar(a.id, { tipo: 'podio', metrica: m.id, rotulo: m.rotulo, medalha: MEDALHA_DA_POSICAO[i], posicao: i + 1, total: geral.length, valor: a[m.campo] });
      });

      const jaRecente = new Set();
      for (const dias of JANELAS_RECENTES) {
        const inicio = somarDias(hojeIso, -(dias - 1));
        if (!(maisAntiga < inicio)) continue; // o histórico não passa da janela: seria igual ao pódio
        const naJanela = ranking(doEsporte.filter((a) => a.data >= inicio && a.data <= hojeIso), m.campo, m.menorVence);
        const melhor = naJanela[0];
        if (!melhor || naJanela.length < 2 || noPodio.has(melhor.id) || jaRecente.has(melhor.id)) continue;
        jaRecente.add(melhor.id);
        adicionar(melhor.id, { tipo: 'recente', metrica: m.id, rotulo: m.rotulo, dias, valor: melhor[m.campo] });
      }
    }
  }

  for (const lista of porAtividade.values()) {
    lista.sort((x, y) => (x.tipo === y.tipo ? (x.tipo === 'podio' ? x.posicao - y.posicao : y.dias - x.dias) : x.tipo === 'podio' ? -1 : 1));
  }
  return porAtividade;
}

/**
 * A medalha que representa a atividade: a mais alta do pódio ('ouro', 'prata' ou 'bronze') ou, sem pódio, 'recente'.
 * Null sem medalhas.
 */
export function melhorMedalha(medalhas) {
  if (!medalhas?.length) return null;
  const podio = medalhas.filter((m) => m.tipo === 'podio');
  if (podio.length === 0) return 'recente';
  return podio.reduce((m, x) => (x.posicao < m.posicao ? x : m), podio[0]).medalha;
}

/** "Melhor dos últimos 30 dias". */
export const textoDaJanela = (dias) => `Melhor dos últimos ${dias} dias`;
