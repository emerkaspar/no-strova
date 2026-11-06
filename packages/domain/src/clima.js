/**
 * Temperatura e clima da atividade. A temperatura vem do sensor do arquivo (FIT) quando existe; o clima (sensação, umidade,
 * vento, chuva e condição) vem do serviço de clima histórico Open-Meteo, pela hora e pelo ponto de partida. Quando não há
 * sensor, a temperatura também vem do serviço. Funções puras, sem Firebase e sem DOM: a busca na rede fica nas Functions.
 */

/** Versão do cálculo gravada na atividade (`climaEm`): mude para refazer o clima do histórico. */
export const VERSAO_DO_CLIMA = 1;

/** Faixa de temperatura considerada leitura válida do sensor (°C). */
const TEMPERATURA_VALIDA = { min: -30, max: 60 };

const HORA_MS = 3600000;

/** Condição do tempo (código WMO do Open-Meteo) em português. */
const CONDICOES = Object.freeze({
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina',
  51: 'Garoa fraca',
  53: 'Garoa',
  55: 'Garoa forte',
  56: 'Garoa gelada',
  57: 'Garoa gelada',
  61: 'Chuva fraca',
  63: 'Chuva',
  65: 'Chuva forte',
  66: 'Chuva gelada',
  67: 'Chuva gelada',
  71: 'Neve fraca',
  73: 'Neve',
  75: 'Neve forte',
  77: 'Neve',
  80: 'Pancadas de chuva fracas',
  81: 'Pancadas de chuva',
  82: 'Pancadas de chuva fortes',
  85: 'Pancadas de neve',
  86: 'Pancadas de neve',
  95: 'Trovoada',
  96: 'Trovoada com granizo',
  99: 'Trovoada com granizo',
});

/** Texto da condição do tempo; `null` para código desconhecido. */
export const condicaoDoClima = (codigo) => CONDICOES[codigo] ?? null;

const arredondar = (v, casas = 0) => {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/**
 * Temperatura do sensor do arquivo: média, mínima e máxima das leituras válidas. `null` sem leituras.
 * @param {Array<{ temp?: number }>} amostras
 */
export function resumirTemperaturaDoSensor(amostras) {
  if (!Array.isArray(amostras)) return null;
  const leituras = amostras.map((a) => a.temp).filter((t) => Number.isFinite(t) && t >= TEMPERATURA_VALIDA.min && t <= TEMPERATURA_VALIDA.max);
  if (leituras.length === 0) return null;
  const media = leituras.reduce((s, v) => s + v, 0) / leituras.length;
  return { mediaC: Math.round(media * 10) / 10, minC: Math.min(...leituras), maxC: Math.max(...leituras) };
}

/** Primeira coordenada válida das amostras (o ponto de partida), arredondada a 2 casas (~1 km) para não enviar o local exato. */
export function pontoDePartida(amostras) {
  if (!Array.isArray(amostras)) return null;
  const a = amostras.find((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180);
  return a ? { lat: Math.round(a.lat * 100) / 100, lon: Math.round(a.lon * 100) / 100 } : null;
}

/** Dias (yyyy-mm-dd, UTC) que a atividade toca, do início ao fim. */
function diasUtc(inicioMs, fimMs) {
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { de: iso(inicioMs), ate: iso(fimMs) };
}

/**
 * Endereço da consulta ao Open-Meteo. Até 7 dias atrás vale a previsão com histórico recente; antes disso, o arquivo histórico
 * (que atrasa alguns dias). Os horários voltam em UTC, para não depender de fuso.
 * @param {{ lat: number, lon: number, inicioMs: number, duracaoS: number, agoraMs: number }} p
 */
export function urlDoClima({ lat, lon, inicioMs, duracaoS, agoraMs }) {
  const { de, ate } = diasUtc(inicioMs, inicioMs + duracaoS * 1000);
  const recente = agoraMs - inicioMs < 7 * 24 * HORA_MS;
  const base = recente ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  const consulta = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: de,
    end_date: ate,
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  return `${base}?${consulta.toString()}`;
}

/**
 * Clima da atividade a partir da resposta horária do Open-Meteo: média ponderada pelo tempo da atividade em cada hora
 * (chuva é a soma proporcional). A condição é a da hora em que a atividade passou mais tempo. `null` sem horas úteis.
 * @param {any} resposta JSON do Open-Meteo
 * @param {number} inicioMs
 * @param {number} duracaoS
 */
export function climaDaResposta(resposta, inicioMs, duracaoS) {
  const h = resposta?.hourly;
  if (!h || !Array.isArray(h.time) || !(duracaoS > 0)) return null;
  const fimMs = inicioMs + duracaoS * 1000;
  const soma = { temp: 0, sens: 0, umid: 0, vento: 0, chuva: 0 };
  const peso = { temp: 0, sens: 0, umid: 0, vento: 0 };
  let codigo = null;
  let maiorSobreposicao = 0;
  let chuvaTem = false;
  for (let i = 0; i < h.time.length; i++) {
    const ini = Date.parse(`${h.time[i]}:00Z`);
    if (!Number.isFinite(ini)) continue;
    // cada valor é a leitura da hora cheia: a atividade usa as horas que ela cobre, de [hora, hora + 1h)
    const sobreposicao = Math.min(fimMs, ini + HORA_MS) - Math.max(inicioMs, ini);
    if (!(sobreposicao > 0)) continue;
    const acumula = (chave, valor) => {
      if (!Number.isFinite(valor)) return;
      soma[chave] += valor * sobreposicao;
      peso[chave] += sobreposicao;
    };
    acumula('temp', h.temperature_2m?.[i]);
    acumula('sens', h.apparent_temperature?.[i]);
    acumula('umid', h.relative_humidity_2m?.[i]);
    acumula('vento', h.wind_speed_10m?.[i]);
    if (Number.isFinite(h.precipitation?.[i])) {
      soma.chuva += h.precipitation[i] * (sobreposicao / HORA_MS);
      chuvaTem = true;
    }
    if (sobreposicao > maiorSobreposicao && Number.isFinite(h.weather_code?.[i])) {
      maiorSobreposicao = sobreposicao;
      codigo = h.weather_code[i];
    }
  }
  if (peso.temp === 0) return null;
  const media = (chave) => (peso[chave] > 0 ? soma[chave] / peso[chave] : null);
  return {
    temperaturaC: arredondar(media('temp'), 1),
    sensacaoC: arredondar(media('sens'), 1),
    umidadePct: arredondar(media('umid')),
    ventoKmh: arredondar(media('vento'), 1),
    chuvaMm: chuvaTem ? arredondar(soma.chuva, 1) : null,
    climaCodigo: codigo,
  };
}

/**
 * Campos de clima para gravar na atividade. O sensor tem prioridade na temperatura (`temperaturaOrigem: 'sensor'`); sem ele,
 * a do serviço (`'clima'`). Sem nenhum dos dois, tudo `null`.
 * @param {{ mediaC: number, minC: number, maxC: number }|null} sensor de `resumirTemperaturaDoSensor`
 * @param {ReturnType<typeof climaDaResposta>} clima
 */
export function camposDeClima(sensor, clima) {
  const temSensor = Boolean(sensor);
  return {
    temperaturaMediaC: temSensor ? sensor.mediaC : (clima?.temperaturaC ?? null),
    temperaturaMinC: temSensor ? sensor.minC : null,
    temperaturaMaxC: temSensor ? sensor.maxC : null,
    temperaturaOrigem: temSensor ? 'sensor' : clima ? 'clima' : null,
    sensacaoC: clima?.sensacaoC ?? null,
    umidadePct: clima?.umidadePct ?? null,
    ventoKmh: clima?.ventoKmh ?? null,
    chuvaMm: clima?.chuvaMm ?? null,
    climaCodigo: clima?.climaCodigo ?? null,
  };
}

/**
 * Recordes de clima entre as atividades: a mais quente, a mais fria (pela temperatura média) e a de mais vento. No empate
 * fica a mais antiga. Cada um é `{ valor, atividade }` ou `null`.
 */
export function recordesDeClima(atividades) {
  const melhor = (campo, menorVence) => {
    let achado = null;
    for (const a of atividades) {
      const v = a[campo];
      if (!Number.isFinite(v)) continue;
      if (campo === 'ventoKmh' && v <= 0) continue;
      const melhora = achado === null || (menorVence ? v < achado.valor : v > achado.valor) || (v === achado.valor && a.data < achado.atividade.data);
      if (melhora) achado = { valor: v, atividade: a };
    }
    return achado;
  };
  return {
    quente: melhor('temperaturaMediaC', false),
    fria: melhor('temperaturaMediaC', true),
    vento: melhor('ventoKmh', false),
  };
}
