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

/** Valor da série num instante exato (interpolação linear entre as duas amostras vizinhas); null se não der para saber. */
function valorEm(serie, campo, instante) {
  const t = serie.t;
  const v = serie[campo];
  if (!v || !(instante >= t[0]) || instante > t[t.length - 1]) return null;
  let i = indiceDoInstante(serie, instante, true); // última amostra com t <= instante
  if (i >= t.length - 1) i = t.length - 2;
  const [a, b] = [v[i], v[i + 1]];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return t[i + 1] === t[i] ? a : a + ((b - a) * (instante - t[i])) / (t[i + 1] - t[i]);
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
 * Passo sem alvo de FC (tiro curto ou `alvoAberto`) não tem veredito pela FC média: devolve a FC média (sem carência) e o `fcPico`,
 * que também olha os 20 s seguintes ao passo (a FC reage com atraso). Para o esforço curto em Z4/Z5 o veredito é o pico:
 * `pico-na-zona` se ele chegou ao mínimo da faixa da zona (`faixaDaZona`), senão `pico-abaixo`. A distância e a velocidade média
 * vêm do instante exato do passo (interpolado), não das amostras vizinhas.
 *
 * @returns {{ indice: number, papel: string, zona: string, faixa: number[]|null, faixaDaZona: number[]|null, duracaoPlanejadaS: number, duracaoRealS: number,
 *   fcMedia: number|null, fcMax: number|null, fcPico: number|null, fracaoNaFaixa: number|null, velMediaKmh: number|null, distanciaM: number|null,
 *   veredito: 'dentro'|'abaixo'|'acima'|'pico-na-zona'|'pico-abaixo'|'sem-alvo'|'sem-dados'|'nao-feito' }}
 */
export function avaliarPasso({ alinhado, serie, config }) {
  const { bloco, iniS, fimS, iniIdx, fimIdx, indice } = alinhado;
  const duracaoRealS = Math.max(0, Math.round(fimS - iniS));
  const faixaDaZona = faixaDeFcDaZona(bloco.zona, config);
  const faixa = bloco.alvoAberto ? null : faixaDaZona;
  const base = {
    indice, papel: bloco.papel, zona: bloco.zona, faixa, faixaDaZona, duracaoPlanejadaS: bloco.duracaoS, duracaoRealS,
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
  const d0 = serie.dist ? valorEm(serie, 'dist', iniS) : null;
  const d1 = serie.dist ? valorEm(serie, 'dist', fimS) : null;
  const distanciaM = Number.isFinite(d0) && Number.isFinite(d1) && d1 >= d0 ? Math.round((d1 - d0) * 1000) : null;
  // com a distância, a velocidade média é distância ÷ tempo: não depende de qual amostra caiu na borda do passo
  const velPelaDistancia = distanciaM !== null && fimS > iniS ? distanciaM / 1000 / ((fimS - iniS) / 3600) : null;
  const resultado = {
    ...base,
    fcMedia: pesoFc > 0 ? Math.round(somaFc / pesoFc) : null,
    fcMax,
    fcPico,
    fracaoNaFaixa: faixa && pesoFc > 0 ? naFaixaS / pesoFc : null,
    velMediaKmh: velPelaDistancia ?? (pesoVel > 0 ? somaVel / pesoVel : null),
    distanciaM,
  };

  if (resultado.fcMedia === null) return { ...resultado, veredito: 'sem-dados' };
  if (!faixa) {
    // tiro curto de Z4/Z5: a régua é o pico (ele vem depois do tiro), não a média do passo
    const ehTiro = bloco.papel === 'principal' && bloco.duracaoS < DURACAO_MINIMA_ALVO_FC_S && (bloco.zona === 'Z4' || bloco.zona === 'Z5');
    if (ehTiro && faixaDaZona && fcPico !== null) return { ...resultado, veredito: fcPico >= faixaDaZona[0] ? 'pico-na-zona' : 'pico-abaixo' };
    return { ...resultado, veredito: 'sem-alvo' };
  }
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

const VEREDITOS_DE_TIRO = ['sem-alvo', 'pico-na-zona', 'pico-abaixo'];

/**
 * Resumo da aderência: os esforços (passos 'principal') com alvo de FC contam em "cumpridos"; os tiros curtos contam à parte
 * (`tirosCurtos`, `picosNaZona`) e entram na consistência.
 * @returns {{ esforcos: number, cumpridos: number, abaixo: number, acima: number, naoFeitos: number, fcMediaEsforcos: number|null, tendenciaFc: number|null,
 *   tirosCurtos: number, picosNaZona: number, tirosComPico: number, consistencia: null | { n: number, velInicialKmh: number, velFinalKmh: number, variacaoPct: number, fcPicoMedio: number|null } }}
 *   `tendenciaFc`: bpm de diferença entre a FC média do último e a do primeiro esforço (positivo = FC subindo; só com 3+ esforços).
 *   `tirosCurtos`: esforços sem alvo de FC por serem curtos (menos de 1 min). `consistencia`: com 2 ou mais tiros e velocidade, quanto o
 *   nível caiu (ou subiu) do começo ao fim; com 4 ou mais compara a média dos 2 primeiros com a dos 2 últimos.
 */
export function resumirAderencia(avaliacoes) {
  const esforcos = avaliacoes.filter((a) => a.papel === 'principal' && !VEREDITOS_DE_TIRO.includes(a.veredito));
  const medidos = esforcos.filter((a) => a.fcMedia !== null);
  const fcMediaEsforcos = medidos.length ? Math.round(medidos.reduce((s, a) => s + a.fcMedia, 0) / medidos.length) : null;
  const tiros = avaliacoes.filter((a) => a.papel === 'principal' && VEREDITOS_DE_TIRO.includes(a.veredito) && a.duracaoPlanejadaS < DURACAO_MINIMA_ALVO_FC_S);
  const comPico = tiros.filter((a) => a.veredito !== 'sem-alvo');
  return {
    tirosCurtos: tiros.length,
    tirosComPico: comPico.length,
    picosNaZona: comPico.filter((a) => a.veredito === 'pico-na-zona').length,
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
