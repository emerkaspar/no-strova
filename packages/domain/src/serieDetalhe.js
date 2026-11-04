/**
 * Série detalhada de uma atividade para a tela de detalhes (gráfico de elevação, FC e velocidade + trajeto no mapa).
 * Reduz as amostras do arquivo a no máximo `MAXIMO_DE_PONTOS` pontos. Funções puras, sem Firebase e sem DOM.
 */
import { haversineM } from './esforcos.js';

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
