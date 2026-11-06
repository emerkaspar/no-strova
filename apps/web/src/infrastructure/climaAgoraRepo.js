import { climaAgoraDaResposta, urlDoClimaAgora } from '@no-strova/domain';

const TEMPO_LIMITE_MS = 4000;
const VALIDADE_MS = 20 * 60 * 1000;
const CHAVE_LOCAL = 'ns:ultimoLocal';
const CHAVE_CACHE = 'ns:climaAgora';

/** Arredonda a 2 casas (~1 km): o local exato nunca sai do aparelho. */
const arredondar = (v) => Math.round(v * 100) / 100;

function ler(armazenamento, chave) {
  try {
    return JSON.parse(armazenamento.getItem(chave) ?? 'null');
  } catch {
    return null;
  }
}

function gravar(armazenamento, chave, valor) {
  try {
    armazenamento.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento (modo privado, cota): só não lembra
  }
}

/**
 * Onde o usuário está: a localização do navegador (pede permissão) ou, se negada ou indisponível, a última que funcionou
 * neste aparelho. `ponto` é null sem nenhuma das duas; `erro` é o código do navegador (1 negada, 2 indisponível,
 * 3 demorou demais) quando a localização falhou, ou 0 se o navegador não tem geolocalização.
 * @returns {Promise<{ ponto: { lat: number, lon: number }|null, erro: number|null }>}
 */
export function localizarUsuario() {
  const ultimo = ler(localStorage, CHAVE_LOCAL);
  if (!('geolocation' in navigator)) return Promise.resolve({ ponto: ultimo, erro: 0 });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ponto = { lat: arredondar(coords.latitude), lon: arredondar(coords.longitude) };
        gravar(localStorage, CHAVE_LOCAL, ponto);
        resolve({ ponto, erro: null });
      },
      (falha) => {
        console.warn('Clima: não foi possível obter a localização', falha.code, falha.message);
        resolve({ ponto: ultimo, erro: falha.code });
      },
      { timeout: 10000, maximumAge: 60 * 60 * 1000 },
    );
  });
}

/**
 * Clima de agora no ponto, com cache de 20 minutos na sessão (trocar de tela não refaz a consulta).
 * Qualquer falha vira `null`: o badge simplesmente não aparece.
 */
export async function buscarClimaAgora(ponto) {
  const cache = ler(sessionStorage, CHAVE_CACHE);
  if (cache && cache.lat === ponto.lat && cache.lon === ponto.lon && Date.now() - cache.em < VALIDADE_MS) return cache.clima;
  try {
    const resposta = await fetch(urlDoClimaAgora(ponto), { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!resposta.ok) {
      console.warn('Clima: o serviço respondeu com erro', resposta.status);
      return null;
    }
    const clima = climaAgoraDaResposta(await resposta.json());
    if (clima) gravar(sessionStorage, CHAVE_CACHE, { ...ponto, em: Date.now(), clima });
    return clima;
  } catch (err) {
    console.warn('Clima: falha ao consultar o serviço', err);
    return null;
  }
}
