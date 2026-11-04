/**
 * Série detalhada de uma atividade para a tela de detalhes (gráfico de elevação, FC e velocidade + trajeto no mapa).
 * Reduz as amostras do arquivo a no máximo `MAXIMO_DE_PONTOS` pontos. Funções puras, sem Firebase e sem DOM.
 */
import { LIMIAR_MOVIMENTO_KMH } from './atividade.js';
import { haversineM } from './esforcos.js';
import { faixaDeFcDaZona } from './treinosEstruturados.js';

/** Versão do formato gravada na atividade (`detalheEm`): mude para regerar a série das atividades antigas. */
export const VERSAO_DO_DETALHE = 1;
const MAXIMO_DE_PONTOS = 1500;
const PASSO_MINIMO_S = 5;
const FC_VALIDA = { min: 30, max: 250 };
const VELOCIDADE_MAXIMA_KMH = 90;

const media = (soma, n) => (n > 0 ? soma / n : null);
const arredondar = (v, casas) => (v === null ? null : Number(v.toFixed(casas)));

/**
 * @param {Array<{ t: number, fc?: number, vel?: number, dist?: number, alt?: number, lat?: number, lon?: number }>} amostras
 * @returns {null | { passoS: number, t: number[], dist?: Array<number|null>, alt?: Array<number|null>, vel?: Array<number|null>,
 *   fc?: Array<number|null>, lat?: Array<number|null>, lon?: Array<number|null> }}
 *   distância em km, altitude em m, velocidade em km/h. Campos sem nenhum dado no arquivo ficam de fora.
 */
export function reduzirSerieDetalhe(amostras) {
  if (!Array.isArray(amostras) || amostras.length < 2) return null;
  const t0 = amostras[0].t;
  const duracao = amostras[amostras.length - 1].t - t0;
  if (!(duracao > 0)) return null;
  const passoS = Math.max(PASSO_MINIMO_S, Math.ceil(duracao / MAXIMO_DE_PONTOS));

  const saida = { t: [], dist: [], alt: [], vel: [], fc: [], lat: [], lon: [] };
  let dAcum = 0;
  let anterior = null;
  let temDistancia = false;
  let distanciaAnteriorDoPasso = 0;
  let tAnteriorDoPasso = 0;

  let balde = -1;
  let acc = null;
  const novo = () => ({ fc: [0, 0], alt: [0, 0], vel: [0, 0], lat: null, lon: null, t: 0, d: null });

  function fechar() {
    if (!acc) return;
    const velArquivo = media(acc.vel[0], acc.vel[1]);
    let vel = velArquivo === null ? null : velArquivo * 3.6;
    if (vel === null && acc.d !== null && acc.t > tAnteriorDoPasso) {
      vel = ((acc.d - distanciaAnteriorDoPasso) / (acc.t - tAnteriorDoPasso)) * 3.6;
    }
    if (vel !== null && (vel > VELOCIDADE_MAXIMA_KMH || vel < 0)) vel = null;
    saida.t.push(Math.round(acc.t));
    saida.dist.push(acc.d === null ? null : arredondar(acc.d / 1000, 3));
    saida.alt.push(arredondar(media(acc.alt[0], acc.alt[1]), 1));
    saida.vel.push(arredondar(vel, 1));
    saida.fc.push(arredondar(media(acc.fc[0], acc.fc[1]), 0));
    saida.lat.push(acc.lat);
    saida.lon.push(acc.lon);
    if (acc.d !== null) {
      distanciaAnteriorDoPasso = acc.d;
    }
    tAnteriorDoPasso = acc.t;
  }

  for (const a of amostras) {
    if (!Number.isFinite(a.t)) continue;
    // distância acumulada: a do arquivo, ou a soma dos trechos entre coordenadas (saltos de GPS acima de 25 m/s não contam)
    if (Number.isFinite(a.dist)) {
      dAcum = Math.max(dAcum, a.dist);
      temDistancia = true;
    } else if (Number.isFinite(a.lat) && Number.isFinite(a.lon)) {
      if (anterior) {
        const trecho = haversineM(anterior.lat, anterior.lon, a.lat, a.lon);
        const dt = a.t - anterior.t;
        if (dt > 0 && trecho / dt <= 25) dAcum += trecho;
      }
      anterior = a;
      temDistancia = true;
    }

    const b = Math.floor((a.t - t0) / passoS);
    if (b !== balde) {
      fechar();
      acc = novo();
      balde = b;
    }
    acc.t = a.t - t0;
    if (temDistancia) acc.d = dAcum;
    if (Number.isFinite(a.fc) && a.fc >= FC_VALIDA.min && a.fc <= FC_VALIDA.max) {
      acc.fc[0] += a.fc;
      acc.fc[1] += 1;
    }
    if (Number.isFinite(a.alt)) {
      acc.alt[0] += a.alt;
      acc.alt[1] += 1;
    }
    if (Number.isFinite(a.vel)) {
      acc.vel[0] += a.vel;
      acc.vel[1] += 1;
    }
    if (Number.isFinite(a.lat) && Number.isFinite(a.lon) && (a.lat !== 0 || a.lon !== 0)) {
      acc.lat = Number(a.lat.toFixed(5));
      acc.lon = Number(a.lon.toFixed(5));
    }
  }
  fechar();

  if (saida.t.length < 2) return null;
  const resultado = { passoS, t: saida.t };
  for (const chave of ['dist', 'alt', 'vel', 'fc', 'lat', 'lon']) {
    if (saida[chave].some((v) => v !== null)) resultado[chave] = saida[chave];
  }
  return resultado;
}

/** Ruído de altitude ignorado ao somar a subida (m), igual ao do resumo da atividade inteira. */
const HISTERESE_ALTITUDE_M = 3;
/** Intervalo máximo entre pontos para contar como tempo contínuo (s); acima disso, é pausa. */
const LACUNA_MAXIMA_S = 30;

const finitos = (lista, i0, i1) => {
  const saida = [];
  for (let i = i0; i <= i1; i++) if (Number.isFinite(lista?.[i])) saida.push(lista[i]);
  return saida;
};

/**
 * Resumo de um trecho (índices `i0`..`i1`, inclusive) da série detalhada: o que a tela mostra quando o usuário seleciona
 * uma parte do gráfico. Calculado sobre a série reduzida, então é uma aproximação da atividade original.
 * @param {ReturnType<typeof reduzirSerieDetalhe>} serie
 * @param {number} i0
 * @param {number} i1
 * @param {string} esporte
 * @returns {null | { duracaoS: number, tempoMovimentoS: number, distanciaM: number | null, altimetriaM: number | null,
 *   fcMedia: number | null, fcMax: number | null, velocidadeMediaKmh: number | null }}
 */
export function resumirTrecho(serie, i0, i1, esporte) {
  if (!serie?.t || !(i1 > i0) || i0 < 0 || i1 >= serie.t.length) return null;
  const duracaoS = serie.t[i1] - serie.t[i0];
  if (!(duracaoS > 0)) return null;

  const distancias = finitos(serie.dist, i0, i1);
  const distanciaM = distancias.length >= 2 ? Math.round((distancias[distancias.length - 1] - distancias[0]) * 1000) : null;

  const limiar = LIMIAR_MOVIMENTO_KMH[esporte] ?? LIMIAR_MOVIMENTO_KMH.outro;
  let movimentoS = 0;
  let temVelocidade = false;
  for (let i = i0 + 1; i <= i1; i++) {
    const dt = serie.t[i] - serie.t[i - 1];
    if (!(dt > 0) || !Number.isFinite(serie.vel?.[i])) continue;
    temVelocidade = true;
    if (serie.vel[i] > limiar && dt <= LACUNA_MAXIMA_S) movimentoS += dt;
  }
  const tempoMovimentoS = temVelocidade && movimentoS > 0 ? Math.round(movimentoS) : Math.round(duracaoS);

  const altitudes = finitos(serie.alt, i0, i1);
  let altimetriaM = null;
  if (altitudes.length >= 2) {
    let ganho = 0;
    let referencia = altitudes[0];
    for (const alt of altitudes.slice(1)) {
      if (alt - referencia >= HISTERESE_ALTITUDE_M) {
        ganho += alt - referencia;
        referencia = alt;
      } else if (referencia - alt >= HISTERESE_ALTITUDE_M) {
        referencia = alt;
      }
    }
    altimetriaM = Math.round(ganho);
  }

  const fcs = finitos(serie.fc, i0, i1);
  const fcMedia = fcs.length ? Math.round(fcs.reduce((s, v) => s + v, 0) / fcs.length) : null;
  const fcMax = fcs.length ? Math.max(...fcs) : null;
  const velocidadeMediaKmh = distanciaM !== null ? (distanciaM / duracaoS) * 3.6 : null;

  return { duracaoS: Math.round(duracaoS), tempoMovimentoS, distanciaM, altimetriaM, fcMedia, fcMax, velocidadeMediaKmh };
}

/** Pontos ({ t em s, d em m }) do trecho para `melhorTempoNaDistancia` (melhor 5 km / 10 km dentro da seleção). */
export function pontosDeDistanciaDoTrecho(serie, i0, i1) {
  const pontos = [];
  for (let i = i0; i <= i1; i++) {
    if (!Number.isFinite(serie.dist?.[i])) continue;
    const d = serie.dist[i] * 1000;
    if (pontos.length === 0 || serie.t[i] > pontos[pontos.length - 1].t) pontos.push({ t: serie.t[i], d });
  }
  return pontos;
}

const ZONAS_DE_FC = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

/**
 * Tempo em cada zona de FC (Z1–Z5) no trecho `i0`..`i1` da série, pelas faixas do LTHR do atleta (as mesmas dos treinos).
 * A FC abaixo da Z1 conta na Z1 e a acima da Z5 conta na Z5. Pausas longas (mais de 30 s entre pontos) não contam.
 * @param {ReturnType<typeof reduzirSerieDetalhe>} serie
 * @param {{ lthr: number, fcMax: number }} config
 * @returns {null | Array<{ zona: string, faixa: [number, number], segundos: number, fracao: number }>} null sem FC ou sem configuração
 */
export function tempoPorZonaDeFc(serie, i0, i1, config) {
  if (!serie?.t || !serie.fc || !config) return null;
  const faixas = ZONAS_DE_FC.map((z) => faixaDeFcDaZona(z, config));
  if (faixas.some((f) => !f)) return null;
  const segundos = [0, 0, 0, 0, 0];
  for (let i = Math.max(1, i0 + 1); i <= i1 && i < serie.t.length; i++) {
    const fc = serie.fc[i];
    const dt = serie.t[i] - serie.t[i - 1];
    if (!Number.isFinite(fc) || !(dt > 0) || dt > LACUNA_MAXIMA_S) continue;
    let z = 0;
    for (let k = 4; k >= 1; k--) {
      if (fc >= faixas[k][0]) {
        z = k;
        break;
      }
    }
    segundos[z] += dt;
  }
  const total = segundos.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  return ZONAS_DE_FC.map((zona, k) => ({ zona, faixa: faixas[k], segundos: Math.round(segundos[k]), fracao: segundos[k] / total }));
}
