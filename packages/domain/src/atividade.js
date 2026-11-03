/**
 * Regras de atividade: resumo a partir das amostras do arquivo, dia no fuso de São Paulo
 * e validação do cadastro manual. Funções puras.
 */
import { dataIsoValida } from './usuarios.js';

export const ESPORTES = Object.freeze({ CICLISMO: 'ciclismo', CORRIDA: 'corrida', OUTRO: 'outro' });
export const ESPORTES_VALIDOS = Object.freeze(Object.values(ESPORTES));

export const FUSO = 'America/Sao_Paulo';

/** Velocidade mínima (km/h) para contar como "em movimento", como no Elevate. */
export const LIMIAR_MOVIMENTO_KMH = Object.freeze({
  [ESPORTES.CICLISMO]: 4,
  [ESPORTES.CORRIDA]: 1.5,
  [ESPORTES.OUTRO]: 0.3,
});

/** Ruído de altitude ignorado ao somar a subida (m). */
const HISTERESE_ALTITUDE_M = 3;
/** Intervalo máximo entre amostras para contar como tempo contínuo (s); acima disso, é pausa. */
const LACUNA_MAXIMA_S = 30;
/** Faixa de FC considerada leitura válida do sensor (bpm). */
const FC_VALIDA = { min: 30, max: 250 };

/**
 * @typedef {object} Amostra
 * @property {number} t segundos desde o início
 * @property {number} [fc] bpm
 * @property {number} [vel] m/s
 * @property {number} [dist] metros acumulados
 * @property {number} [alt] metros
 * @property {number} [lat] graus
 * @property {number} [lon] graus
 */

/** Dia (yyyy-mm-dd) de um instante, no fuso de São Paulo. */
export function diaNoFuso(instanteMs) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instanteMs));
  return partes; // en-CA formata como yyyy-mm-dd
}

function haversineM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distância total (m): usa a distância acumulada do arquivo; senão soma os trechos entre coordenadas. */
function distanciaTotal(amostras) {
  let ultimaDist = null;
  for (const a of amostras) if (Number.isFinite(a.dist)) ultimaDist = a.dist;
  if (ultimaDist !== null) return ultimaDist;

  let total = 0;
  let anterior = null;
  for (const a of amostras) {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    if (anterior) total += haversineM(anterior.lat, anterior.lon, a.lat, a.lon);
    anterior = a;
  }
  return total;
}

/** Subida acumulada (m) com histerese para descartar ruído do altímetro. */
function subidaAcumulada(amostras) {
  let ganho = 0;
  let referencia = null;
  for (const { alt } of amostras) {
    if (!Number.isFinite(alt)) continue;
    if (referencia === null) {
      referencia = alt;
      continue;
    }
    if (alt - referencia >= HISTERESE_ALTITUDE_M) {
      ganho += alt - referencia;
      referencia = alt;
    } else if (referencia - alt >= HISTERESE_ALTITUDE_M) {
      referencia = alt;
    }
  }
  return ganho;
}

/** Velocidade (m/s) de cada amostra: a do arquivo ou a derivada da distância entre amostras. */
function velocidadeEm(amostras, i) {
  const a = amostras[i];
  if (Number.isFinite(a.vel)) return a.vel;
  const anterior = amostras[i - 1];
  if (!anterior || !(a.t > anterior.t)) return null;
  if (Number.isFinite(a.dist) && Number.isFinite(anterior.dist)) {
    return (a.dist - anterior.dist) / (a.t - anterior.t);
  }
  if (
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lon) &&
    Number.isFinite(anterior.lat) &&
    Number.isFinite(anterior.lon)
  ) {
    return haversineM(anterior.lat, anterior.lon, a.lat, a.lon) / (a.t - anterior.t);
  }
  return null;
}

/**
 * Resumo da atividade a partir das amostras.
 *  - FC média: média simples das leituras válidas (como no Elevate).
 *  - Tempo em movimento: soma dos intervalos em que a velocidade supera o limiar do esporte;
 *    sem dado de velocidade, vale a duração total.
 * @param {Amostra[]} amostras ordenadas por `t`
 * @param {string} esporte
 */
export function resumirAmostras(amostras, esporte) {
  if (!Array.isArray(amostras) || amostras.length < 2) return null;

  const duracaoS = Math.round(amostras[amostras.length - 1].t - amostras[0].t);
  if (!(duracaoS > 0)) return null;

  const fcs = amostras.map((a) => a.fc).filter((fc) => Number.isFinite(fc) && fc >= FC_VALIDA.min && fc <= FC_VALIDA.max);
  const fcMedia = fcs.length > 0 ? Math.round(fcs.reduce((s, v) => s + v, 0) / fcs.length) : null;
  const fcMax = fcs.length > 0 ? Math.max(...fcs) : null;

  const limiarMs = (LIMIAR_MOVIMENTO_KMH[esporte] ?? LIMIAR_MOVIMENTO_KMH.outro) / 3.6;
  let temVelocidade = false;
  let movimentoS = 0;
  for (let i = 1; i < amostras.length; i++) {
    const intervalo = amostras[i].t - amostras[i - 1].t;
    if (!(intervalo > 0)) continue;
    const vel = velocidadeEm(amostras, i);
    if (vel === null) continue;
    temVelocidade = true;
    if (vel > limiarMs && intervalo <= LACUNA_MAXIMA_S) movimentoS += intervalo;
  }
  const tempoMovimentoS = temVelocidade && movimentoS > 0 ? Math.round(movimentoS) : duracaoS;

  return {
    duracaoS,
    tempoMovimentoS,
    distanciaM: Math.round(distanciaTotal(amostras)),
    altimetriaM: Math.round(subidaAcumulada(amostras)),
    fcMedia,
    fcMax,
  };
}

/** Reduz a série de FC a um ponto a cada `passoS` segundos (média do intervalo), para o gráfico. */
export function reduzirSerieFc(amostras, passoS = 5) {
  const t = [];
  const fc = [];
  let inicio = amostras[0]?.t ?? 0;
  let soma = 0;
  let n = 0;
  for (const a of amostras) {
    if (a.t - inicio >= passoS && n > 0) {
      t.push(Math.round(inicio - (amostras[0]?.t ?? 0)));
      fc.push(Math.round(soma / n));
      inicio = a.t;
      soma = 0;
      n = 0;
    }
    if (Number.isFinite(a.fc) && a.fc >= FC_VALIDA.min && a.fc <= FC_VALIDA.max) {
      soma += a.fc;
      n += 1;
    }
  }
  if (n > 0) {
    t.push(Math.round(inicio - (amostras[0]?.t ?? 0)));
    fc.push(Math.round(soma / n));
  }
  return { t, fc };
}

/** Mapeia o nome de esporte do arquivo (FIT/TCX/GPX) para os esportes do app. */
export function esporteDoArquivo(nome) {
  const s = String(nome ?? '').trim().toLowerCase();
  if (/(cycling|biking|bike|ride|ciclismo|pedal)/.test(s) || s === '1') return ESPORTES.CICLISMO; // GPX do Strava: 1 = pedal
  if (/(running|run|corrida)/.test(s) || s === '9') return ESPORTES.CORRIDA; // GPX do Strava: 9 = corrida
  return ESPORTES.OUTRO;
}

function numeroPositivo(valor) {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @typedef {object} AtividadeManual
 * @property {string} esporte
 * @property {string} data yyyy-mm-dd
 * @property {string} horaInicio HH:mm
 * @property {number} duracaoS
 * @property {number|null} distanciaM
 * @property {number|null} altimetriaM
 * @property {number|null} fcMedia
 * @property {string|null} zona
 * @property {number|null} calorias
 * @property {number|null} hrssManual
 */

/**
 * Valida o cadastro manual. Exige uma forma de obter o estresse:
 * HRSS informado, FC média ou zona predominante.
 * @returns {{ valido: boolean, erros: string[], valores: AtividadeManual|null }}
 */
export function validarAtividadeManual(entrada, zonasValidas, hojeMs = Date.now()) {
  const erros = [];
  const { esporte, data, horaInicio, zona } = entrada ?? {};

  if (!ESPORTES_VALIDOS.includes(esporte)) erros.push('Escolha o esporte.');
  if (!dataIsoValida(data)) {
    erros.push('Informe a data da atividade.');
  } else if (data > diaNoFuso(hojeMs)) {
    erros.push('A data da atividade não pode estar no futuro.');
  }
  const hora = horaInicio === undefined || horaInicio === null || horaInicio === '' ? '12:00' : horaInicio;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) erros.push('Hora de início inválida.');

  const duracaoMin = numeroPositivo(entrada?.duracaoMin);
  if (duracaoMin === null || duracaoMin > 24 * 60) erros.push('Informe a duração em minutos (até 24 horas).');

  const opcional = (valor, rotulo, maximo) => {
    if (valor === undefined || valor === null || valor === '') return null;
    const n = numeroPositivo(valor);
    if (n === null || n > maximo) {
      erros.push(`${rotulo} inválido.`);
      return null;
    }
    return n;
  };
  const distanciaKm = opcional(entrada?.distanciaKm, 'Distância', 2000);
  const altimetriaM = opcional(entrada?.altimetriaM, 'Altimetria', 20000);
  const fcMedia = opcional(entrada?.fcMedia, 'FC média', 250);
  const calorias = opcional(entrada?.calorias, 'Calorias', 20000);
  const hrssManual = opcional(entrada?.hrssManual, 'Estresse (HRSS)', 2000);

  let zonaEscolhida = null;
  if (zona !== undefined && zona !== null && zona !== '') {
    if (zonasValidas.includes(zona)) zonaEscolhida = zona;
    else erros.push('Zona inválida.');
  }
  if (hrssManual === null && fcMedia === null && zonaEscolhida === null) {
    erros.push('Informe a FC média, a zona predominante ou o estresse (HRSS) da atividade.');
  }

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return {
    valido: true,
    erros,
    valores: {
      esporte,
      data,
      horaInicio: hora,
      duracaoS: Math.round(duracaoMin * 60),
      distanciaM: distanciaKm === null ? null : Math.round(distanciaKm * 1000),
      altimetriaM: altimetriaM === null ? null : Math.round(altimetriaM),
      fcMedia: fcMedia === null ? null : Math.round(fcMedia),
      zona: zonaEscolhida,
      calorias: calorias === null ? null : Math.round(calorias),
      hrssManual,
    },
  };
}

/** Idade completa na data da atividade (yyyy-mm-dd), a partir da data de nascimento. */
export function idadeNaData(dataNascimento, data) {
  if (!dataIsoValida(dataNascimento) || !dataIsoValida(data)) return null;
  const [an, mn, dn] = dataNascimento.split('-').map(Number);
  const [a, m, d] = data.split('-').map(Number);
  let idade = a - an;
  if (m < mn || (m === mn && d < dn)) idade -= 1;
  return idade >= 0 ? idade : null;
}
