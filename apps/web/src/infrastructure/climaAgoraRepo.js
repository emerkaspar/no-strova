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
 * neste aparelho. `null` sem nenhuma das duas.
 * @returns {Promise<{ lat: number, lon: number }|null>}
 */
export function localizarUsuario() {
  const ultimo = ler(localStorage, CHAVE_LOCAL);
  if (!('geolocation' in navigator)) return Promise.resolve(ultimo);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ponto = { lat: arredondar(coords.latitude), lon: arredondar(coords.longitude) };
        gravar(localStorage, CHAVE_LOCAL, ponto);
        resolve(ponto);
      },
      () => resolve(ultimo),
      { timeout: TEMPO_LIMITE_MS, maximumAge: 60 * 60 * 1000 },
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
    if (!resposta.ok) return null;
    const clima = climaAgoraDaResposta(await resposta.json());
    if (clima) gravar(sessionStorage, CHAVE_CACHE, { ...ponto, em: Date.now(), clima });
    return clima;
  } catch {
    return null;
  }
}
