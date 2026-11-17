import { fcDeReferencia } from './desempenho.js';
import { esforcosDoEsporte } from './esforcos.js';
import { somarDias } from './forma.js';

/**
 * Evolução: respostas diretas à pergunta "estou melhorando?", a partir dos treinos comparáveis (`pontosDeDesempenho`) e dos
 * melhores esforços. Funções puras, sem Firebase e sem DOM.
 */

/** Variação (em %) a partir da qual uma mudança deixa de ser "estável". */
export const LIMITE_DE_MUDANCA_PCT = 2;
/** Janela do comparativo de velocidade na mesma FC e dos melhores esforços (dias). */
export const JANELA_DA_VELOCIDADE_DIAS = 60;
export const JANELA_DOS_ESFORCOS_DIAS = 90;

const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const variacaoPct = (de, para) => (finito(de) && finito(para) && de !== 0 ? ((para - de) / Math.abs(de)) * 100 : null);
const noIntervalo = (lista, de, ate) => lista.filter((p) => p.data >= de && p.data <= ate);
const mediaPorTempo = (lista, valorDe) => {
  const t = lista.reduce((s, p) => s + p.tempoS, 0);
  return t > 0 ? lista.reduce((s, p) => s + valorDe(p) * p.tempoS, 0) / t : null;
};

/** Velocidade (km/h) que o treino teria na FC de referência: `velocidade × FC de referência ÷ FC média` (mesma ideia do EF). */
export const velocidadeNaFc = (ponto, fcRef) => (ponto.velocidadeKmh * fcRef) / ponto.fcMedia;

/**
 * Média móvel ponderada pelo tempo, calculada em cada dia que teve treino: a média dos treinos dos últimos `janela` dias.
 * @returns {Array<{ data: string, valor: number, n: number }>}
 */
export function mediaMovelNosTreinos(pontos, valorDe, janela = 28) {
  const datas = [...new Set(pontos.map((p) => p.data))].sort();
  const saida = [];
  for (const data of datas) {
    const dentro = noIntervalo(pontos, somarDias(data, -(janela - 1)), data);
    const valor = mediaPorTempo(dentro, valorDe);
    if (finito(valor)) saida.push({ data, valor, n: dentro.length });
  }
  return saida;
}

/**
 * Velocidade na mesma FC: a janela recente × a anterior, com a velocidade de cada treino ajustada para a FC de referência.
 * @returns {null | { fcRef: number, dias: number, recenteKmh: number|null, anteriorKmh: number|null, variacaoPct: number|null, nRecente: number, nAnterior: number }}
 */
export function comparativoNaFc(pontos, { hoje, dias = JANELA_DA_VELOCIDADE_DIAS }) {
  const fcRef = fcDeReferencia(pontos, hoje);
  if (fcRef === null) return null;
  const recenteDe = somarDias(hoje, -(dias - 1));
  const rec = noIntervalo(pontos, recenteDe, hoje);
  const ant = noIntervalo(pontos, somarDias(recenteDe, -dias), somarDias(recenteDe, -1));
  const valor = (p) => velocidadeNaFc(p, fcRef);
  const recenteKmh = mediaPorTempo(rec, valor);
  const anteriorKmh = mediaPorTempo(ant, valor);
  return { fcRef, dias, recenteKmh, anteriorKmh, variacaoPct: variacaoPct(anteriorKmh, recenteKmh), nRecente: rec.length, nAnterior: ant.length };
}

/**
 * Melhores esforços por distância: o melhor tempo dos últimos `dias` dias × o dos `dias` anteriores. A variação é em velocidade
 * (positiva = ficou mais rápido). `recorde` indica que o melhor recente é o melhor de todos os tempos.
 * @returns {Array<{ id: string, rotulo: string, metros: number, recente: object|null, anterior: object|null, variacaoPct: number|null, recorde: boolean }>}
 */
export function comparativoDeEsforcos(atividades, esporte, { hoje, dias = JANELA_DOS_ESFORCOS_DIAS }) {
  const recenteDe = somarDias(hoje, -(dias - 1));
  const anteriorDe = somarDias(recenteDe, -dias);
  return esforcosDoEsporte(esporte)
    .map(({ id, campo, metros, rotulo }) => {
      const melhor = (de, ate) => {
        let achado = null;
        for (const a of atividades ?? []) {
          if (a?.esporte !== esporte || a.data < de || a.data > ate) continue;
          const t = a[campo];
          if (!finito(t) || t <= 0) continue;
          if (!achado || t < achado.tempoS) achado = { tempoS: t, data: a.data, velocidadeKmh: (metros / t) * 3.6 };
        }
        return achado;
      };
      const recente = melhor(recenteDe, hoje);
      const anterior = melhor(anteriorDe, somarDias(recenteDe, -1));
      const todos = melhor('0000-01-01', hoje);
      return {
        id,
        rotulo,
        metros,
        recente,
        anterior,
        variacaoPct: recente && anterior ? (anterior.tempoS / recente.tempoS - 1) * 100 : null,
        recorde: Boolean(recente && todos && recente.tempoS <= todos.tempoS && anterior),
      };
    })
    .filter((e) => e.recente || e.anterior);
}

const numero = (v) => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const comSinal = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${numero(v)}%`;

/**
 * Veredito de evolução em uma frase, juntando os sinais de desempenho: velocidade na mesma FC e melhores esforços. A sequência de
 * semanas treinando só entra como contexto (não decide o tom).
 * @param {{ naFc: object|null, esforcos: object[], sequenciaSemanas?: number, esporte?: string }} p
 * @returns {{ id: 'melhorou'|'piorou'|'misto'|'estavel'|'sem-dados', rotulo: string, texto: string, destaque: number|null }}
 */
export function vereditoDeEvolucao({ naFc, esforcos = [], sequenciaSemanas = 0, esporte = 'ciclismo' }) {
  const sinais = [];
  const frases = [];
  if (naFc && finito(naFc.variacaoPct)) {
    sinais.push(naFc.variacaoPct);
    frases.push(`${comSinal(naFc.variacaoPct)} de ${esporte === 'corrida' ? 'ritmo' : 'velocidade'} na mesma FC`);
  }
  const comparaveis = esforcos.filter((e) => finito(e.variacaoPct));
  if (comparaveis.length) {
    const mediaEsforcos = comparaveis.reduce((s, e) => s + e.variacaoPct, 0) / comparaveis.length;
    sinais.push(mediaEsforcos);
    const recordes = comparaveis.filter((e) => e.recorde && e.variacaoPct > 0).map((e) => e.rotulo);
    frases.push(recordes.length ? `novo melhor de ${recordes.join(' e ')}` : `melhores esforços ${comSinal(mediaEsforcos)} em média`);
  }

  const positivos = sinais.filter((v) => v >= LIMITE_DE_MUDANCA_PCT).length;
  const negativos = sinais.filter((v) => v <= -LIMITE_DE_MUDANCA_PCT).length;
  let id;
  if (!sinais.length) id = 'sem-dados';
  else if (positivos && negativos) id = 'misto';
  else if (positivos) id = 'melhorou';
  else if (negativos) id = 'piorou';
  else id = 'estavel';

  const rotulos = {
    melhorou: 'Você está evoluindo',
    piorou: 'Desempenho em queda',
    misto: 'Sinais mistos',
    estavel: 'Desempenho estável',
    'sem-dados': 'Ainda sem base para comparar',
  };
  let texto;
  if (id === 'sem-dados') texto = 'Faltam treinos comparáveis nas duas janelas de tempo. Treine leve e constante, com FC, que o sistema passa a comparar.';
  else {
    const lista = frases.join('; ');
    const contexto = sequenciaSemanas >= 2 ? `; ${sequenciaSemanas} semanas seguidas treinando` : '';
    const final = id === 'piorou' ? '. Calor, cansaço, sono ruim ou pausa nos treinos costumam explicar; olhe a tendência de várias semanas.' : '.';
    texto = `${lista[0].toUpperCase()}${lista.slice(1)}${contexto}${final}`;
  }
  const destaque = naFc && finito(naFc.variacaoPct) ? naFc.variacaoPct : sinais[0] ?? null;
  return { id, rotulo: rotulos[id], texto, destaque };
}
