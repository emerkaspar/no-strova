/**
 * Melhores esforços por distância (5 km e 10 km): o trecho contínuo mais rápido de uma atividade, medido nas amostras
 * do arquivo (distância acumulada ou coordenadas). Funções puras, sem Firebase e sem DOM.
 */
export const DISTANCIAS_DE_ESFORCO = Object.freeze({ cincoK: 5000, dezK: 10000 });
/** Versão do cálculo gravada na atividade (`melhoresEsforcosEm`): mude para recalcular o histórico. */
export const VERSAO_DOS_ESFORCOS = 1;
/** Acima de 20 m/s (72 km/h) no trecho, o dado é tratado como falha de GPS e descartado. */
const VELOCIDADE_MAXIMA_MS = 20;

const RAIO_TERRA_M = 6371000;
const rad = (g) => (g * Math.PI) / 180;
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Pontos (tempo em s, distância acumulada em m) crescentes. Usa a distância do arquivo quando a amostra tem; senão soma
 * os trechos entre coordenadas. Saltos impossíveis de GPS (mais de 25 m/s entre amostras) não somam distância.
 * @param {Array<{ t: number, dist?: number, lat?: number, lon?: number }>} amostras
 * @returns {Array<{ t: number, d: number }>}
 */
export function distanciaAcumulada(amostras) {
  const pontos = [];
  let d = 0;
  let anterior = null;
  for (const a of [...amostras].sort((x, y) => x.t - y.t)) {
    if (!Number.isFinite(a.t)) continue;
    if (Number.isFinite(a.dist)) {
      d = Math.max(d, a.dist);
    } else if (Number.isFinite(a.lat) && Number.isFinite(a.lon)) {
      if (anterior && Number.isFinite(anterior.lat)) {
        const trecho = haversineM(anterior.lat, anterior.lon, a.lat, a.lon);
        const dt = a.t - anterior.t;
        if (dt > 0 && trecho / dt <= 25) d += trecho;
      }
    } else {
      continue;
    }
    anterior = a;
    if (pontos.length === 0 || a.t > pontos[pontos.length - 1].t) pontos.push({ t: a.t, d });
  }
  return pontos;
}

/**
 * Menor tempo (s) para percorrer `metros` seguidos, com janela deslizante e interpolação no começo do trecho.
 * Null se a atividade é mais curta que a distância ou se o resultado é fisicamente impossível.
 * @param {Array<{ t: number, d: number }>} pontos de `distanciaAcumulada`
 */
export function melhorTempoNaDistancia(pontos, metros) {
  const n = pontos.length;
  if (n < 2 || pontos[n - 1].d - pontos[0].d < metros) return null;
  let melhor = Infinity;
  let i = 0;
  for (let j = 1; j < n; j++) {
    const alvo = pontos[j].d - metros;
    if (alvo < pontos[0].d) continue;
    while (i + 1 < j && pontos[i + 1].d <= alvo) i++;
    const a = pontos[i];
    const b = pontos[i + 1];
    const passo = b.d - a.d;
    const inicio = passo > 0 ? a.t + ((alvo - a.d) / passo) * (b.t - a.t) : a.t;
    const duracao = pontos[j].t - inicio;
    if (duracao > 0 && duracao < melhor) melhor = duracao;
  }
  if (!Number.isFinite(melhor) || metros / melhor > VELOCIDADE_MAXIMA_MS) return null;
  return Math.round(melhor);
}

/** Melhor 5 km e melhor 10 km (segundos) de uma lista de amostras; null onde a atividade não chega à distância. */
export function melhoresEsforcos(amostras) {
  const pontos = distanciaAcumulada(amostras);
  return {
    melhor5kS: melhorTempoNaDistancia(pontos, DISTANCIAS_DE_ESFORCO.cincoK),
    melhor10kS: melhorTempoNaDistancia(pontos, DISTANCIAS_DE_ESFORCO.dezK),
  };
}

/**
 * Melhor tempo de cada distância entre as atividades (o menor, não o maior; no empate fica a mais antiga).
 * @returns {{ melhor5k: { valor: number, atividade: any }|null, melhor10k: { valor: number, atividade: any }|null }}
 */
export function melhoresEsforcosDasAtividades(atividades) {
  const melhorDe = (campo) => {
    let melhor = null;
    for (const a of atividades) {
      const v = a[campo];
      if (!Number.isFinite(v) || v <= 0) continue;
      if (melhor === null || v < melhor.valor || (v === melhor.valor && a.data < melhor.atividade.data)) melhor = { valor: v, atividade: a };
    }
    return melhor;
  };
  return { melhor5k: melhorDe('melhor5kS'), melhor10k: melhorDe('melhor10kS') };
}

/** Ritmo médio (s por km) de um esforço: tempo ÷ distância. */
export function ritmoDoEsforco(tempoS, metros) {
  return Number.isFinite(tempoS) && tempoS > 0 ? Math.round((tempoS / metros) * 1000) : null;
}
