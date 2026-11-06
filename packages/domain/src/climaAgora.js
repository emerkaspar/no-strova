/**
 * Clima de agora (Open-Meteo, leitura atual) para o badge do card "Forma hoje". Funções puras, sem Firebase e sem DOM:
 * a busca na rede e a localização ficam no frontend (infrastructure). Reaproveita a condição e o ícone de clima.js.
 */

/** Endereço da leitura atual do Open-Meteo; o fuso vem do próprio ponto. */
export function urlDoClimaAgora({ lat, lon }) {
  const consulta = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code,is_day',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${consulta.toString()}`;
}

const numero = (v) => (Number.isFinite(v) ? v : null);

/**
 * Clima de agora a partir da resposta do Open-Meteo. `null` sem temperatura.
 * @param {any} resposta
 * @returns {{ temperaturaC: number, sensacaoC: number|null, ventoKmh: number|null, chuvaMm: number|null, climaCodigo: number|null, dia: boolean }|null}
 */
export function climaAgoraDaResposta(resposta) {
  const c = resposta?.current;
  if (!c || !Number.isFinite(c.temperature_2m)) return null;
  return {
    temperaturaC: Math.round(c.temperature_2m),
    sensacaoC: numero(c.apparent_temperature) === null ? null : Math.round(c.apparent_temperature),
    ventoKmh: numero(c.wind_speed_10m) === null ? null : Math.round(c.wind_speed_10m),
    chuvaMm: numero(c.precipitation),
    climaCodigo: numero(c.weather_code),
    dia: c.is_day !== 0,
  };
}

/** Frase curta e discreta sobre o tempo de agora, pensando em treinar. */
export function fraseDoClima(clima) {
  const { climaCodigo: codigo, sensacaoC, ventoKmh, dia } = clima;
  if (codigo >= 95 && codigo <= 99) return 'Trovoada agora. Melhor esperar.';
  if ((codigo >= 51 && codigo <= 57) || codigo === 80) return 'Garoa fina. Vale o risco.';
  if ((codigo >= 61 && codigo <= 67) || codigo === 81 || codigo === 82) return 'Vale o risco.';
  if (codigo === 45 || codigo === 48) return 'Neblina. Visibilidade baixa.';
  if (!dia) return 'Já é noite. Use luz e refletivo.';
  if (sensacaoC !== null && sensacaoC >= 33) return 'Calor forte. Hidrate e modere.';
  if (ventoKmh !== null && ventoKmh >= 30) return 'Vento forte. Comece contra ele.';
  if (sensacaoC !== null && sensacaoC <= 10) return 'Só botar mais um casaquinho.';
  if (codigo === 0 || codigo === 1) return 'Bom dia para treinar.';
  return 'Tempo firme para treinar.';
}
