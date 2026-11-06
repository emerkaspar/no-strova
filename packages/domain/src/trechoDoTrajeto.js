/**
 * Trecho do trajeto: a parte de uma atividade que acompanha a rota de referência de um trajeto. Uma atividade pode só
 * passar pelo trajeto e seguir por outros caminhos; a evolução usa só esse trecho. Funções puras (sem Firebase e sem DOM),
 * feitas para rodar uma vez no servidor (ao salvar a atividade ou ao trocar a referência) e ter o resultado gravado.
 *
 * Como funciona: cada ponto com GPS da série detalhada (`reduzirSerieDetalhe`) é comparado com os segmentos da rota de
 * referência. Pontos a até `toleranciaM` de algum segmento "estão na rota" e ganham a posição (m) ao longo dela. O trecho é a
 * maior sequência de pontos na rota avançando no mesmo sentido, que cubra ao menos `coberturaMinima` da rota.
 *
 * Limites conhecidos: sentido contrário não casa; em rota que volta ao ponto de partida (circuito), o primeiro ponto
 * pode ser projetado no fim da rota e ser descartado; a série tem no máximo 1500 pontos, então o início e o fim do
 * trecho têm a precisão do espaçamento entre amostras (cerca de 100 m em 4 h de pedal).
 */
import { haversineM } from './esforcos.js';
import { resumirTrecho, tempoPorZonaDeFc } from './serieDetalhe.js';

export const PARAMETROS_DO_TRECHO = Object.freeze({
  /** Distância máxima (m) de um ponto até a rota para contar como "na rota". */
  toleranciaM: 40,
  /** Fração mínima da rota (0 a 1) que o trecho precisa cobrir. */
  coberturaMinima: 0.8,
  /** Espaçamento mínimo (m) entre pontos da rota guardada. */
  espacamentoMinimoM: 10,
  /** Máximo de pontos da rota guardada no trajeto. */
  maxPontosDaRota: 400,
  /** Rota mais curta que isso (m) não serve de referência. */
  comprimentoMinimoM: 200,
  /** Avanço máximo (m) na rota entre dois pontos seguidos na rota; acima disso o ponto é um cruzamento e é ignorado. */
  saltoMaximoM: 600,
  /** Retrocesso tolerado (m) na posição ao longo da rota (ruído de GPS); acima disso é sentido contrário ou nova volta. */
  retrocessoMaximoM: 40,
  /** Pontos seguidos fora da rota que ainda não encerram o trecho. */
  foraSeguidosMax: 4,
});

const RAIO_TERRA_M = 6371000;
const rad = (g) => (g * Math.PI) / 180;
const finito = (v) => typeof v === 'number' && Number.isFinite(v);

/** Projeção plana local (equiretangular) em metros, boa para distâncias de poucos quilômetros. */
function projetor(lat0, lon0) {
  const k = Math.cos(rad(lat0));
  return (lat, lon) => [rad(lon - lon0) * k * RAIO_TERRA_M, rad(lat - lat0) * RAIO_TERRA_M];
}

/** Rota válida: `{ lat: number[], lon: number[], comprimentoM }` com ao menos 2 pontos. (Firestore não aceita lista de listas.) */
export function rotaValida(rota) {
  return (
    !!rota &&
    Array.isArray(rota.lat) &&
    Array.isArray(rota.lon) &&
    rota.lat.length === rota.lon.length &&
    rota.lat.length >= 2 &&
    rota.lat.length <= PARAMETROS_DO_TRECHO.maxPontosDaRota &&
    rota.lat.every((v) => finito(v) && v >= -90 && v <= 90) &&
    rota.lon.every((v) => finito(v) && v >= -180 && v <= 180) &&
    finito(rota.comprimentoM) &&
    rota.comprimentoM >= PARAMETROS_DO_TRECHO.comprimentoMinimoM
  );
}

/**
 * Monta a rota de referência a partir de uma parte (`i0`..`i1`, inclusive) da série detalhada de uma atividade.
 * @param {{ t?: number[], lat?: Array<number|null>, lon?: Array<number|null> }} serie
 * @returns {null | { lat: number[], lon: number[], comprimentoM: number }} null sem GPS ou com rota curta demais
 */
export function rotaDeReferencia(serie, i0 = 0, i1 = (serie?.t?.length ?? 1) - 1) {
  if (!serie?.lat || !serie?.lon) return null;
  const pontos = [];
  for (let i = Math.max(0, i0); i <= i1 && i < serie.lat.length; i++) {
    if (finito(serie.lat[i]) && finito(serie.lon[i])) pontos.push([serie.lat[i], serie.lon[i]]);
  }
  const reduzir = (espacamento) => {
    const saida = [];
    let comprimento = 0;
    for (const p of pontos) {
      const ult = saida[saida.length - 1];
      if (!ult) {
        saida.push(p);
        continue;
      }
      const d = haversineM(ult[0], ult[1], p[0], p[1]);
      if (d >= espacamento) {
        comprimento += d;
        saida.push(p);
      }
    }
    return { saida, comprimento };
  };
  let { saida, comprimento } = reduzir(PARAMETROS_DO_TRECHO.espacamentoMinimoM);
  if (saida.length > PARAMETROS_DO_TRECHO.maxPontosDaRota) {
    ({ saida, comprimento } = reduzir((comprimento / PARAMETROS_DO_TRECHO.maxPontosDaRota) * 1.1));
  }
  if (saida.length < 2 || comprimento < PARAMETROS_DO_TRECHO.comprimentoMinimoM) return null;
  return { lat: saida.map((p) => p[0]), lon: saida.map((p) => p[1]), comprimentoM: Math.round(comprimento) };
}

/** Distância (m) de um ponto a um segmento e a posição relativa (0 a 1) da projeção nele. */
function pontoNoSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const quad = dx * dx + dy * dy;
  const t = quad > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / quad)) : 0;
  return { dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/**
 * Acha na série o trecho que acompanha a rota de referência.
 * @param {{ t: number[], dist?: Array<number|null>, lat?: Array<number|null>, lon?: Array<number|null> }} serie
 * @param {{ lat: number[], lon: number[], comprimentoM: number }} rota
 * @param {Partial<typeof PARAMETROS_DO_TRECHO>} [opcoes]
 * @returns {null | { i0: number, i1: number, tIniS: number, tFimS: number, iniM: number|null, fimM: number|null, cobertura: number }}
 *   `i0`/`i1` são índices da série (só valem para ela); `tIniS`/`tFimS`/`iniM`/`fimM` são estáveis para gravar.
 */
export function acharTrechoNaSerie(serie, rota, opcoes = {}) {
  const p = { ...PARAMETROS_DO_TRECHO, ...opcoes };
  if (!serie?.t || !serie.lat || !serie.lon || !rotaValida(rota)) return null;

  const proj = projetor(rota.lat[0], rota.lon[0]);
  const vertices = rota.lat.map((la, i) => proj(la, rota.lon[i]));
  const acumulado = [0];
  const comprimentos = [];
  for (let k = 0; k < vertices.length - 1; k++) {
    const c = Math.hypot(vertices[k + 1][0] - vertices[k][0], vertices[k + 1][1] - vertices[k][1]);
    comprimentos.push(c);
    acumulado.push(acumulado[k] + c);
  }
  const total = acumulado[acumulado.length - 1];
  if (!(total > 0)) return null;

  // grade: cada segmento entra nas células que sua caixa, ampliada pela tolerância, cobre; o ponto consulta só a própria célula
  const lado = p.toleranciaM * 2;
  const celula = (v) => Math.floor(v / lado);
  const grade = new Map();
  for (let k = 0; k < vertices.length - 1; k++) {
    const [ax, ay] = vertices[k];
    const [bx, by] = vertices[k + 1];
    const x0 = celula(Math.min(ax, bx) - p.toleranciaM);
    const x1 = celula(Math.max(ax, bx) + p.toleranciaM);
    const y0 = celula(Math.min(ay, by) - p.toleranciaM);
    const y1 = celula(Math.max(ay, by) + p.toleranciaM);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const chave = `${gx},${gy}`;
        const lista = grade.get(chave);
        if (lista) lista.push(k);
        else grade.set(chave, [k]);
      }
    }
  }

  /** Posição (m) ao longo da rota do ponto, ou null se estiver a mais que a tolerância dela. */
  function posicaoNaRota(lat, lon) {
    const [x, y] = proj(lat, lon);
    const candidatos = grade.get(`${celula(x)},${celula(y)}`);
    if (!candidatos) return null;
    let melhor = null;
    for (const k of candidatos) {
      const r = pontoNoSegmento(x, y, vertices[k][0], vertices[k][1], vertices[k + 1][0], vertices[k + 1][1]);
      if (r.dist <= p.toleranciaM && (melhor === null || r.dist < melhor.dist)) {
        melhor = { dist: r.dist, s: acumulado[k] + r.t * comprimentos[k] };
      }
    }
    return melhor ? melhor.s : null;
  }

  const corridas = [];
  let atual = null;
  const fechar = () => {
    if (atual) corridas.push(atual);
    atual = null;
  };
  const iniciar = (i, s) => {
    atual = { i0: i, i1: i, sIni: s, sUlt: s, fora: 0 };
  };

  for (let i = 0; i < serie.t.length; i++) {
    if (!finito(serie.lat[i]) || !finito(serie.lon[i])) continue; // sem GPS neste ponto: não conta a favor nem contra
    const s = posicaoNaRota(serie.lat[i], serie.lon[i]);
    if (s === null) {
      if (atual && ++atual.fora > p.foraSeguidosMax) fechar();
      continue;
    }
    if (!atual) {
      iniciar(i, s);
      continue;
    }
    const delta = s - atual.sUlt;
    if (delta < -p.retrocessoMaximoM) {
      // voltou na rota: sentido contrário ou nova volta
      fechar();
      iniciar(i, s);
    } else if (delta > p.saltoMaximoM) {
      // cruzamento com outro ponto da rota: ignora o ponto
      if (++atual.fora > p.foraSeguidosMax) fechar();
    } else {
      atual.i1 = i;
      atual.sUlt = Math.max(atual.sUlt, s);
      atual.fora = 0;
    }
  }
  fechar();

  let melhor = null;
  for (const c of corridas) {
    const cobertura = Math.min(1, (c.sUlt - c.sIni) / total);
    if (cobertura >= p.coberturaMinima && (melhor === null || cobertura > melhor.cobertura)) melhor = { ...c, cobertura };
  }
  if (!melhor || !(melhor.i1 > melhor.i0)) return null;
  return trechoDaSerie(serie, melhor.i0, melhor.i1, Number(melhor.cobertura.toFixed(2)));
}

function trechoDaSerie(serie, i0, i1, cobertura) {
  const km = (i) => (finito(serie.dist?.[i]) ? Math.round(serie.dist[i] * 1000) : null);
  return { i0, i1, tIniS: serie.t[i0], tFimS: serie.t[i1], iniM: km(i0), fimM: km(i1), cobertura };
}

/**
 * Trecho escolhido à mão pela distância (m) na atividade: a saída quando a detecção automática erra.
 * @returns {null | ReturnType<typeof acharTrechoNaSerie>} null sem distância na série ou com trecho vazio
 */
export function trechoPorDistancia(serie, iniM, fimM) {
  if (!serie?.t || !serie.dist || !finito(iniM) || !finito(fimM) || !(fimM > iniM)) return null;
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < serie.t.length; i++) {
    const d = serie.dist[i];
    if (!finito(d)) continue;
    if (i0 === -1 && d * 1000 >= iniM) i0 = i;
    if (d * 1000 <= fimM) i1 = i;
  }
  if (i0 === -1 || !(i1 > i0)) return null;
  return trechoDaSerie(serie, i0, i1, null);
}

/** Índices da série para um trecho gravado (`tIniS`/`tFimS`), que sobrevive a uma série regerada com outro passo. */
export function indicesDoTrecho(serie, trecho) {
  if (!serie?.t || !finito(trecho?.tIniS) || !finito(trecho?.tFimS)) return null;
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < serie.t.length; i++) {
    if (i0 === -1 && serie.t[i] >= trecho.tIniS) i0 = i;
    if (serie.t[i] <= trecho.tFimS) i1 = i;
  }
  return i0 !== -1 && i1 > i0 ? { i0, i1 } : null;
}

/**
 * O que se grava na atividade (`trajetoTrecho`): o trecho e o resumo dele, para a tela não reler a série.
 * @param {string} origem 'auto' (GPS) ou 'manual'
 * @param {{ lthr: number, fcMax: number } | null} configZonas configuração de FC que gerou o HRSS da atividade
 * @returns {null | Record<string, unknown>}
 */
export function resumoDoTrechoDoTrajeto(serie, trecho, esporte, origem, configZonas = null) {
  const indices = trecho && finito(trecho.i0) && finito(trecho.i1) ? { i0: trecho.i0, i1: trecho.i1 } : indicesDoTrecho(serie, trecho);
  if (!indices) return null;
  const resumo = resumirTrecho(serie, indices.i0, indices.i1, esporte);
  if (!resumo) return null;
  const zonas = tempoPorZonaDeFc(serie, indices.i0, indices.i1, configZonas);
  const saida = {
    origem,
    tIniS: trecho.tIniS,
    tFimS: trecho.tFimS,
    iniM: trecho.iniM ?? null,
    fimM: trecho.fimM ?? null,
    cobertura: trecho.cobertura ?? null,
    duracaoS: resumo.duracaoS,
    tempoMovimentoS: resumo.tempoMovimentoS,
    distanciaM: resumo.distanciaM,
    altimetriaM: resumo.altimetriaM,
    fcMedia: resumo.fcMedia,
    fcMax: resumo.fcMax,
    tempoZonasS: zonas ? zonas.map((z) => z.segundos) : null,
  };
  return saida;
}
