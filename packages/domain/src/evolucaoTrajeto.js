import { indicesDoTrecho } from './trechoDoTrajeto.js';

/**
 * Evolução do usuário em um trajeto: cada "passagem" é uma atividade vinculada ao trajeto, medida só no trecho do trajeto
 * quando ele foi detectado (`trajetoTrecho` e `trajetoVoltas`, ver trechoDoTrajeto.js) e na atividade inteira quando não foi. Funções puras.
 *
 * O trajeto é por nome, então a distância varia de uma passagem para outra. Por isso a comparação usa velocidade/ritmo e
 * eficiência, e não o tempo total.
 */

/** Diferença de distância (fração da mediana) a partir da qual a passagem destoa das demais. */
export const TOLERANCIA_DE_DISTANCIA = 0.15;
/** Quantas passagens de cada ponta entram na comparação "início × recente". */
export const JANELA_DE_COMPARACAO = 3;

const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);

function mediana(lista) {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Passagens de uma atividade no trajeto. Cada vez que a atividade percorre o trecho conta uma passagem: a primeira volta fica em
 * `trajetoTrecho` e as seguintes em `trajetoVoltas` (só quando o trecho foi detectado pela rota). Sem trecho, é uma só, com a
 * atividade inteira. HRSS, sensação e etiquetas são da atividade inteira, então só a primeira volta leva o HRSS.
 * O `id` da primeira volta é o da atividade; as demais usam `<id>#<volta>`. `atividadeId` é sempre o da atividade.
 * @returns {object[]} vazio quando a atividade não tem distância e tempo para medir
 */
export function passagensDaAtividade(atividade) {
  if (!atividade) return [];
  // `origem: 'inteira'` é a escolha do usuário de usar a atividade toda, sem trecho
  const t = atividade.trajetoTrecho && atividade.trajetoTrecho.origem !== 'inteira' ? atividade.trajetoTrecho : null;
  const extras = t && t.origem === 'auto' && Array.isArray(atividade.trajetoVoltas) ? atividade.trajetoVoltas : [];
  const lista = [t, ...extras].map((trecho, i) => montarPassagem(atividade, trecho, i + 1)).filter(Boolean);
  // se a primeira não mede (sem distância e tempo), as seguintes seguem como estão, mas renumeradas na ordem
  lista.forEach((p, i) => {
    p.volta = i + 1;
    p.totalVoltas = lista.length;
  });
  return lista;
}

/** A primeira passagem da atividade no trajeto (ou null); veja `passagensDaAtividade`. */
export function passagemDoTrajeto(atividade) {
  return passagensDaAtividade(atividade)[0] ?? null;
}

function montarPassagem(atividade, t, volta) {
  const base = t ?? atividade;
  const tempoS = finito(base.tempoMovimentoS) ? base.tempoMovimentoS : base.duracaoS;
  const distanciaM = base.distanciaM;
  if (!finito(tempoS) || tempoS <= 0 || !finito(distanciaM) || distanciaM <= 0) return null;

  const velocidadeKmh = (distanciaM / tempoS) * 3.6;
  const fcMedia = finito(base.fcMedia) ? base.fcMedia : null;
  const fb = atividade.feedback ?? null;
  return {
    id: volta === 1 ? atividade.id : `${atividade.id}#${volta}`,
    atividadeId: atividade.id,
    volta,
    totalVoltas: 1,
    data: atividade.data,
    titulo: atividade.titulo ?? null,
    esporte: atividade.esporte,
    soTrecho: !!t,
    trecho: t ? { tIniS: t.tIniS, tFimS: t.tFimS } : null,
    trechoIniM: t && finito(t.iniM) ? t.iniM : null,
    trechoFimM: t && finito(t.fimM) ? t.fimM : null,
    origemDoTrecho: t ? (t.origem ?? null) : (atividade.trajetoTrecho?.origem ?? null),
    cobertura: t?.cobertura ?? null,
    tempoS,
    distanciaM,
    ritmoSKm: tempoS / (distanciaM / 1000),
    velocidadeKmh,
    altimetriaM: finito(base.altimetriaM) ? base.altimetriaM : null,
    fcMedia,
    fcMax: finito(base.fcMax) ? base.fcMax : null,
    eficiencia: eficienciaAerobica(distanciaM, tempoS, fcMedia),
    tempoZonasS: Array.isArray(base.tempoZonasS) && base.tempoZonasS.length === 5 ? base.tempoZonasS : null,
    hrss: volta === 1 && finito(atividade.hrss) ? atividade.hrss : null,
    sensacao: finito(fb?.sensacao) ? fb.sensacao : null,
    rpe: finito(fb?.rpe) ? fb.rpe : null,
    etiquetas: Array.isArray(fb?.etiquetas) ? fb.etiquetas : [],
    dor: fb?.dor ?? null,
    temArquivo: atividade.origem === 'arquivo',
  };
}

/**
 * Eficiência aeróbica: metros por minuto para cada batimento por minuto de FC média. Quanto maior, mais rápido para a
 * mesma FC, ou seja, melhor condicionamento (vale comparar passagens em condições parecidas).
 * @returns {number|null} null sem FC
 */
export function eficienciaAerobica(distanciaM, tempoS, fcMedia) {
  if (!finito(distanciaM) || !finito(tempoS) || tempoS <= 0 || !finito(fcMedia) || fcMedia <= 0) return null;
  return distanciaM / (tempoS / 60) / fcMedia;
}

/**
 * Passagens do trajeto em ordem de data (a mais antiga primeiro; no mesmo dia, pela ordem das voltas). Cada volta de uma
 * atividade conta como uma passagem. Atividades sem distância e tempo ficam de fora.
 */
export function passagensDoTrajeto(atividades, trajetoId) {
  return (atividades ?? [])
    .filter((a) => a?.trajetoId === trajetoId)
    .flatMap(passagensDaAtividade)
    .sort((a, b) => (a.data === b.data ? String(a.atividadeId).localeCompare(String(b.atividadeId)) || a.volta - b.volta : a.data < b.data ? -1 : 1));
}

/** Distância típica (mediana, em m) das passagens. */
export const distanciaTipica = (passagens) => mediana(passagens.map((p) => p.distanciaM));

/** A passagem destoa da distância típica do trajeto (provável desvio de percurso)? */
export function passagemDestoante(passagem, tipicaM, tolerancia = TOLERANCIA_DE_DISTANCIA) {
  return finito(tipicaM) && tipicaM > 0 && Math.abs(passagem.distanciaM - tipicaM) / tipicaM > tolerancia;
}

/**
 * Tendência linear de uma métrica ao longo do tempo.
 * @param {Array<{ data: string }>} passagens em ordem de data
 * @param {(p: object) => number|null} campo
 * @returns {null | { inclinacaoPorMes: number, pontos: number, valorEm: (iso: string) => number }} ao menos 3 pontos com a
 *   métrica e 2 datas diferentes; `valorEm` dá o valor da reta numa data (para desenhar a tendência)
 */
export function tendenciaLinear(passagens, campo) {
  const pontos = passagens.map((p) => ({ x: diaDaData(p.data), y: campo(p) })).filter((q) => finito(q.x) && finito(q.y));
  if (pontos.length < 3) return null;
  const mx = media(pontos.map((q) => q.x));
  const my = media(pontos.map((q) => q.y));
  const sxx = pontos.reduce((s, q) => s + (q.x - mx) ** 2, 0);
  if (!(sxx > 0)) return null;
  const sxy = pontos.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0);
  const inclinacao = sxy / sxx;
  return { inclinacaoPorMes: inclinacao * 30, pontos: pontos.length, valorEm: (iso) => my + inclinacao * (diaDaData(iso) - mx) };
}

/** Dias desde 1970 de uma data ISO (AAAA-MM-DD). */
function diaDaData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null;
}

/** Variação percentual de `de` para `para`; null se não der para calcular. */
const variacao = (de, para) => (finito(de) && finito(para) && de !== 0 ? ((para - de) / Math.abs(de)) * 100 : null);

/**
 * Início × recente: média das primeiras contra a das últimas passagens (até `JANELA_DE_COMPARACAO` de cada ponta, sem
 * repetir passagem). Variação positiva da velocidade ou da eficiência é melhora.
 * @returns {null | { n: number, velocidade: number|null, eficiencia: number|null, fcMedia: number|null,
 *   velocidadeInicio: number|null, velocidadeRecente: number|null }} null com menos de 2 passagens
 */
export function compararInicioRecente(passagens, janela = JANELA_DE_COMPARACAO) {
  const n = Math.min(janela, Math.floor(passagens.length / 2));
  if (n < 1) return null;
  const inicio = passagens.slice(0, n);
  const recente = passagens.slice(-n);
  const m = (lista, campo) => media(lista.map(campo).filter(finito));
  return {
    n,
    velocidade: variacao(m(inicio, (p) => p.velocidadeKmh), m(recente, (p) => p.velocidadeKmh)),
    eficiencia: variacao(m(inicio, (p) => p.eficiencia), m(recente, (p) => p.eficiencia)),
    fcMedia: variacao(m(inicio, (p) => p.fcMedia), m(recente, (p) => p.fcMedia)),
    velocidadeInicio: m(inicio, (p) => p.velocidadeKmh),
    velocidadeRecente: m(recente, (p) => p.velocidadeKmh),
  };
}

/**
 * Pódio do trajeto: as três passagens mais rápidas (maior velocidade; em empate, a mais antiga) viram ouro, prata e bronze.
 * @returns {Map<string, 'ouro'|'prata'|'bronze'>} id da passagem → medalha
 */
export function podioDoTrajeto(passagens) {
  const ordem = [...passagens].sort((a, b) => b.velocidadeKmh - a.velocidadeKmh || (a.data < b.data ? -1 : 1));
  const nomes = ['ouro', 'prata', 'bronze'];
  return new Map(ordem.slice(0, 3).map((p, i) => [p.id, nomes[i]]));
}

/**
 * Resumo do trajeto para os cartões do topo.
 * @returns {null | object} null sem passagens
 */
export function resumoDoTrajeto(passagens) {
  if (!passagens.length) return null;
  const velocidades = passagens.map((p) => p.velocidadeKmh);
  const mv = media(velocidades);
  const desvio = Math.sqrt(media(velocidades.map((v) => (v - mv) ** 2)));
  const tipica = distanciaTipica(passagens);
  const melhor = passagens.reduce((a, b) => (b.velocidadeKmh > a.velocidadeKmh ? b : a));
  return {
    total: passagens.length,
    primeira: passagens[0].data,
    ultima: passagens[passagens.length - 1].data,
    melhor,
    recente: passagens[passagens.length - 1],
    distanciaTipicaM: tipica,
    destoantes: passagens.filter((p) => passagemDestoante(p, tipica)).length,
    semTrecho: passagens.filter((p) => !p.soTrecho).length,
    // coeficiente de variação da velocidade: menor = mais constante
    consistencia: mv > 0 ? desvio / mv : null,
    inicioRecente: compararInicioRecente(passagens),
    tendenciaVelocidade: tendenciaLinear(passagens, (p) => p.velocidadeKmh),
    tendenciaEficiencia: tendenciaLinear(passagens, (p) => p.eficiencia),
  };
}

/**
 * Diferença entre duas passagens (`b` menos `a`) para a comparação lado a lado.
 * Em tempo e ritmo, negativo é melhor; em velocidade e eficiência, positivo é melhor.
 */
export function compararPassagens(a, b) {
  const dif = (x, y) => (finito(x) && finito(y) ? y - x : null);
  const zonas = a.tempoZonasS && b.tempoZonasS ? b.tempoZonasS.map((v, i) => v - a.tempoZonasS[i]) : null;
  return {
    tempoS: dif(a.tempoS, b.tempoS),
    distanciaM: dif(a.distanciaM, b.distanciaM),
    ritmoSKm: dif(a.ritmoSKm, b.ritmoSKm),
    velocidadeKmh: dif(a.velocidadeKmh, b.velocidadeKmh),
    velocidadePct: variacao(a.velocidadeKmh, b.velocidadeKmh),
    fcMedia: dif(a.fcMedia, b.fcMedia),
    fcMax: dif(a.fcMax, b.fcMax),
    eficiencia: dif(a.eficiencia, b.eficiencia),
    eficienciaPct: variacao(a.eficiencia, b.eficiencia),
    altimetriaM: dif(a.altimetriaM, b.altimetriaM),
    hrss: dif(a.hrss, b.hrss),
    zonasS: zonas,
  };
}

/** Sensação a partir da qual o dia conta como pesado (escala: 1 = ótima, 5 = destruído). */
const SENSACAO_PESADA = 4;
/** RPE a partir do qual o esforço percebido conta como alto. */
const RPE_ALTO = 8;

/**
 * Fatores que podem explicar uma passagem fora do normal: calor, frio, sensação pesada, esforço percebido alto, dor,
 * sono ruim, perna pesada e cansaço. Lista de ids (`calor`, `frio`, `sensacao-pesada`, `rpe-alto`, `dor`, `sono-ruim`,
 * `perna-pesada`, `cansaco`).
 */
export function contextoDaPassagem(passagem) {
  const f = new Set();
  for (const e of passagem.etiquetas) if (['calor', 'frio', 'dor', 'sono-ruim', 'perna-pesada', 'cansaco'].includes(e)) f.add(e);
  if (passagem.dor) f.add('dor');
  if (finito(passagem.sensacao) && passagem.sensacao >= SENSACAO_PESADA) f.add('sensacao-pesada');
  if (finito(passagem.rpe) && passagem.rpe >= RPE_ALTO) f.add('rpe-alto');
  return [...f];
}

/** Rótulos dos fatores de `contextoDaPassagem`. */
export const ROTULOS_DO_CONTEXTO = Object.freeze({
  calor: 'Calor',
  frio: 'Frio',
  dor: 'Dor',
  'sono-ruim': 'Sono ruim',
  'perna-pesada': 'Perna pesada',
  cansaco: 'Cansaço',
  'sensacao-pesada': 'Sensação pesada',
  'rpe-alto': 'Esforço percebido alto',
});

/**
 * Parciais por km (ou por `passoM`) de um trecho da série detalhada: tempo, velocidade e FC média de cada parcial.
 * A última parcial pode ser menor que o passo.
 * @param {{ t: number[], dist?: Array<number|null>, fc?: Array<number|null> }} serie
 * @param {number} i0
 * @param {number} i1
 * @returns {Array<{ fimM: number, distanciaM: number, tempoS: number, velocidadeKmh: number, fcMedia: number|null }>}
 *   vazio sem distância na série
 */
export function parciaisDoTrecho(serie, i0, i1, passoM = 1000) {
  if (!serie?.t || !serie.dist || !(i1 > i0)) return [];
  const pontos = [];
  for (let i = i0; i <= i1; i++) if (finito(serie.dist[i])) pontos.push({ i, d: serie.dist[i] * 1000, t: serie.t[i] });
  if (pontos.length < 2) return [];
  const d0 = pontos[0].d;
  const t0 = pontos[0].t;
  const saida = [];
  let inicioD = 0; // distância relativa ao início do trecho
  let inicioT = 0;
  let proximo = passoM;
  let fcs = [];
  for (let k = 1; k < pontos.length; k++) {
    const { i, d, t } = pontos[k];
    if (finito(serie.fc?.[i])) fcs.push(serie.fc[i]);
    const rel = d - d0;
    const tRel = t - t0;
    while (rel >= proximo) {
      // interpola o instante em que a parcial fecha, entre o ponto anterior e este
      const anterior = pontos[k - 1];
      const relAnt = anterior.d - d0;
      const tAnt = anterior.t - t0;
      const fracao = rel > relAnt ? (proximo - relAnt) / (rel - relAnt) : 1;
      const tFecha = tAnt + fracao * (tRel - tAnt);
      saida.push(parcial(inicioD, proximo, inicioT, tFecha, fcs));
      inicioD = proximo;
      inicioT = tFecha;
      proximo += passoM;
      fcs = [];
    }
  }
  const relFinal = pontos[pontos.length - 1].d - d0;
  const tFinal = pontos[pontos.length - 1].t - t0;
  if (relFinal - inicioD >= passoM * 0.1) saida.push(parcial(inicioD, relFinal, inicioT, tFinal, fcs));
  return saida;
}

function parcial(deM, ateM, deT, ateT, fcs) {
  const distanciaM = ateM - deM;
  const tempoS = Math.max(1, ateT - deT);
  const fc = media(fcs);
  return {
    fimM: Math.round(ateM),
    distanciaM: Math.round(distanciaM),
    tempoS: Math.round(tempoS),
    velocidadeKmh: (distanciaM / tempoS) * 3.6,
    fcMedia: fc === null ? null : Math.round(fc),
  };
}

/**
 * Perfil da passagem na série detalhada (o trecho do trajeto, ou a atividade inteira), com a distância contada do início
 * do trecho, para sobrepor passagens no mesmo eixo.
 * @param {{ t: number[], dist?: Array<number|null>, vel?: Array<number|null>, fc?: Array<number|null>, lat?: Array<number|null>, lon?: Array<number|null> }} serie
 * @param {{ trecho: { tIniS: number, tFimS: number } | null }} passagem
 * @returns {null | { i0: number, i1: number, t: number[], dKm: Array<number|null>|null, vel: Array<number|null>|null,
 *   fc: Array<number|null>|null, lat: Array<number|null>|null, lon: Array<number|null>|null }}
 */
export function perfilDaPassagem(serie, passagem) {
  if (!serie?.t || serie.t.length < 2) return null;
  const indices = passagem.trecho ? indicesDoTrecho(serie, passagem.trecho) : null;
  const i0 = indices?.i0 ?? 0;
  const i1 = indices?.i1 ?? serie.t.length - 1;
  const fatia = (lista) => (lista ? lista.slice(i0, i1 + 1) : null);
  const dist = fatia(serie.dist);
  const d0 = dist ? dist.find(finito) : undefined;
  const t0 = serie.t[i0];
  return {
    i0,
    i1,
    t: serie.t.slice(i0, i1 + 1).map((v) => v - t0),
    dKm: dist && finito(d0) ? dist.map((d) => (finito(d) ? d - d0 : null)) : null,
    vel: fatia(serie.vel),
    fc: fatia(serie.fc),
    lat: fatia(serie.lat),
    lon: fatia(serie.lon),
  };
}
