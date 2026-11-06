import { DURACAO_MINIMA_ALVO_FC_S, expandirPassos, faixaDeFcDaZona } from './treinosEstruturados.js';

/** Diferença máxima (s) entre a duração de uma volta do aparelho e a do passo para ainda contar como o mesmo passo. */
const LACUNA_MAXIMA_S = 30;
const CARENCIA_MAXIMA_S = 30;
const CARENCIA_MAXIMA_FRACAO = 0.4;
const FRACAO_NA_FAIXA_PARA_CUMPRIR = 0.6;
/** O pico de FC de um tiro curto acontece depois dele (a FC reage com atraso): procura até este tempo após o fim do passo. */
const JANELA_DO_PICO_S = 20;

/**
 * Posição, na série, do primeiro ponto com t >= segundos (e do último com t <= segundos).
 * A série vem reduzida (passo >= 5 s), então os índices são aproximados ao passo.
 */
function indiceDoInstante(serie, segundos, ultimo) {
  const t = serie.t;
  if (ultimo) {
    for (let i = t.length - 1; i >= 0; i--) if (t[i] <= segundos) return i;
    return 0;
  }
  for (let i = 0; i < t.length; i++) if (t[i] >= segundos) return i;
  return t.length - 1;
}

/**
 * Casa cada passo planejado (já expandido) com um trecho da atividade.
 *
 * - Se o aparelho gravou uma volta por passo (mesma quantidade de voltas e de blocos), usa as voltas: `origem: 'volta'`.
 * - Senão, empilha as durações planejadas a partir do início da atividade, deslocadas por `deslocamentoS`: `origem: 'tempo'`.
 *
 * @param {{ passos: object[], voltas?: Array<{ iniS: number, fimS: number }>|null, serie: { t: number[] }, deslocamentoS?: number }} p
 * @returns {Array<{ indice: number, bloco: object, iniS: number, fimS: number, iniIdx: number, fimIdx: number, origem: 'volta'|'tempo', incompleto: boolean }>}
 */
export function alinharPassos({ passos, voltas, serie, deslocamentoS = 0 }) {
  const blocos = expandirPassos(passos);
  if (!blocos.length || !serie?.t || serie.t.length < 2) return [];
  const fimDaSerie = serie.t[serie.t.length - 1];

  const porVolta = Array.isArray(voltas) && voltas.length === blocos.length;
  let cursor = (serie.t[0] ?? 0) + deslocamentoS;

  return blocos.map((bloco, indice) => {
    let iniS;
    let fimS;
    if (porVolta) {
      iniS = voltas[indice].iniS;
      fimS = voltas[indice].fimS;
    } else {
      iniS = cursor;
      fimS = cursor + bloco.duracaoS;
      cursor = fimS;
    }
    const incompleto = fimS > fimDaSerie + LACUNA_MAXIMA_S || iniS >= fimDaSerie;
    const iniC = Math.min(Math.max(iniS, serie.t[0]), fimDaSerie);
    const fimC = Math.min(fimS, fimDaSerie);
    return {
      indice,
      bloco,
      iniS: iniC,
      fimS: Math.max(iniC, fimC),
      iniIdx: indiceDoInstante(serie, iniC, false),
      fimIdx: indiceDoInstante(serie, Math.max(iniC, fimC), true),
      origem: porVolta ? 'volta' : 'tempo',
      incompleto,
    };
  });
}

/**
 * Mede um trecho alinhado contra o alvo do passo.
 * Ignora a carência inicial (a FC demora a reagir ao esforço) ao calcular a FC média e o tempo na faixa.
 *
 * Passo sem alvo de FC (tiro curto ou `alvoAberto`) não recebe veredito: devolve a FC média (sem carência) e o `fcPico`,
 * que também olha os 20 s seguintes ao passo.
 *
 * @returns {{ indice: number, papel: string, zona: string, faixa: number[]|null, duracaoPlanejadaS: number, duracaoRealS: number,
 *   fcMedia: number|null, fcMax: number|null, fcPico: number|null, fracaoNaFaixa: number|null, velMediaKmh: number|null, distanciaM: number|null,
 *   veredito: 'dentro'|'abaixo'|'acima'|'sem-alvo'|'sem-dados'|'nao-feito' }}
 */
export function avaliarPasso({ alinhado, serie, config }) {
  const { bloco, iniS, fimS, iniIdx, fimIdx, indice } = alinhado;
  const duracaoRealS = Math.max(0, Math.round(fimS - iniS));
  const faixa = bloco.alvoAberto ? null : faixaDeFcDaZona(bloco.zona, config);
  const base = {
    indice, papel: bloco.papel, zona: bloco.zona, faixa, duracaoPlanejadaS: bloco.duracaoS, duracaoRealS,
    fcMedia: null, fcMax: null, fcPico: null, fracaoNaFaixa: null, velMediaKmh: null, distanciaM: null,
  };
  if (alinhado.incompleto && duracaoRealS < bloco.duracaoS * 0.5) return { ...base, veredito: 'nao-feito' };

  // sem faixa não há o que a carência proteger: a FC média é a do passo inteiro
  const carenciaS = faixa ? Math.min(CARENCIA_MAXIMA_S, duracaoRealS * CARENCIA_MAXIMA_FRACAO) : 0;
  const medirDesde = iniS + carenciaS;
  let somaFc = 0;
  let pesoFc = 0;
  let naFaixaS = 0;
  let fcMax = null;
  let somaVel = 0;
  let pesoVel = 0;
  for (let i = Math.max(1, iniIdx + 1); i <= fimIdx && i < serie.t.length; i++) {
    const dt = serie.t[i] - serie.t[i - 1];
    if (!(dt > 0) || dt > LACUNA_MAXIMA_S) continue;
    if (serie.t[i] > medirDesde) {
      const fc = serie.fc?.[i];
      if (Number.isFinite(fc)) {
        somaFc += fc * dt;
        pesoFc += dt;
        if (fcMax === null || fc > fcMax) fcMax = fc;
        if (faixa && fc >= faixa[0] && fc <= faixa[1]) naFaixaS += dt;
      }
    }
    const vel = serie.vel?.[i];
    if (Number.isFinite(vel)) {
      somaVel += vel * dt;
      pesoVel += dt;
    }
  }
  let fcPico = null;
  for (let i = iniIdx; i < serie.t.length && serie.t[i] <= fimS + JANELA_DO_PICO_S; i++) {
    const fc = serie.fc?.[i];
    if (Number.isFinite(fc) && (fcPico === null || fc > fcPico)) fcPico = fc;
  }
  const distancias = [serie.dist?.[iniIdx], serie.dist?.[fimIdx]];
  const distanciaM = distancias.every(Number.isFinite) && distancias[1] >= distancias[0] ? Math.round((distancias[1] - distancias[0]) * 1000) : null;
  const resultado = {
    ...base,
    fcMedia: pesoFc > 0 ? Math.round(somaFc / pesoFc) : null,
    fcMax,
    fcPico,
    fracaoNaFaixa: faixa && pesoFc > 0 ? naFaixaS / pesoFc : null,
    velMediaKmh: pesoVel > 0 ? somaVel / pesoVel : null,
    distanciaM,
  };

  if (resultado.fcMedia === null) return { ...resultado, veredito: 'sem-dados' };
  if (!faixa) return { ...resultado, veredito: 'sem-alvo' };
  let veredito;
  if (resultado.fracaoNaFaixa >= FRACAO_NA_FAIXA_PARA_CUMPRIR) veredito = 'dentro';
  else if (resultado.fcMedia < faixa[0]) veredito = 'abaixo';
  else if (resultado.fcMedia > faixa[1]) veredito = 'acima';
  else veredito = 'dentro';
  return { ...resultado, veredito };
}

/** Alinha e avalia todos os passos de uma vez. */
export function compararPassos({ passos, voltas, serie, config, deslocamentoS = 0 }) {
  const alinhados = alinharPassos({ passos, voltas, serie, deslocamentoS });
  return alinhados.map((alinhado) => ({ alinhado, avaliacao: avaliarPasso({ alinhado, serie, config }) }));
}

/**
 * Resumo da aderência considerando só os esforços (passos 'principal' com alvo).
 * @returns {{ esforcos: number, cumpridos: number, abaixo: number, acima: number, naoFeitos: number, fcMediaEsforcos: number|null, tendenciaFc: number|null,
 *   tirosCurtos: number, consistencia: null | { n: number, velInicialKmh: number, velFinalKmh: number, variacaoPct: number, fcPicoMedio: number|null } }}
 *   `tendenciaFc`: bpm de diferença entre a FC média do último e a do primeiro esforço (positivo = FC subindo; só com 3+ esforços).
 *   `tirosCurtos`: esforços sem alvo de FC por serem curtos (menos de 1 min). `consistencia`: com 2 ou mais tiros e velocidade, quanto o
 *   nível caiu (ou subiu) do começo ao fim; com 4 ou mais compara a média dos 2 primeiros com a dos 2 últimos.
 */
export function resumirAderencia(avaliacoes) {
  const esforcos = avaliacoes.filter((a) => a.papel === 'principal' && a.veredito !== 'sem-alvo');
  const medidos = esforcos.filter((a) => a.fcMedia !== null);
  const fcMediaEsforcos = medidos.length ? Math.round(medidos.reduce((s, a) => s + a.fcMedia, 0) / medidos.length) : null;
  const tiros = avaliacoes.filter((a) => a.papel === 'principal' && a.veredito === 'sem-alvo' && a.duracaoPlanejadaS < DURACAO_MINIMA_ALVO_FC_S);
  return {
    tirosCurtos: tiros.length,
    consistencia: consistenciaDosTiros(tiros),
    esforcos: esforcos.length,
    cumpridos: esforcos.filter((a) => a.veredito === 'dentro').length,
    abaixo: esforcos.filter((a) => a.veredito === 'abaixo').length,
    acima: esforcos.filter((a) => a.veredito === 'acima').length,
    naoFeitos: esforcos.filter((a) => a.veredito === 'nao-feito').length,
    fcMediaEsforcos,
    tendenciaFc: medidos.length >= 3 ? medidos[medidos.length - 1].fcMedia - medidos[0].fcMedia : null,
  };
}

const mediaDe = (valores) => valores.reduce((t, v) => t + v, 0) / valores.length;

function consistenciaDosTiros(tiros) {
  const comVelocidade = tiros.filter((a) => Number.isFinite(a.velMediaKmh) && a.velMediaKmh > 0);
  if (comVelocidade.length < 2) return null;
  const k = comVelocidade.length >= 4 ? 2 : 1;
  const velInicialKmh = mediaDe(comVelocidade.slice(0, k).map((a) => a.velMediaKmh));
  const velFinalKmh = mediaDe(comVelocidade.slice(-k).map((a) => a.velMediaKmh));
  const picos = tiros.map((a) => a.fcPico).filter(Number.isFinite);
  return {
    n: comVelocidade.length,
    velInicialKmh,
    velFinalKmh,
    variacaoPct: Math.round(((velFinalKmh - velInicialKmh) / velInicialKmh) * 100),
    fcPicoMedio: picos.length ? Math.round(mediaDe(picos)) : null,
  };
}
