/**
 * Potência de ciclismo: usa a medida do arquivo (medidor de potência) quando existe; senão estima pelo modelo físico
 * (resistência de rolagem + subida + arrasto do ar + aceleração), a partir de velocidade, altitude e peso. Sem vento,
 * sem vácuo de pelotão e com piso único, a margem típica é de 10 a 20%: serve para tendência, não para FTP preciso.
 * Funções puras, sem Firebase e sem DOM.
 */

/** Versão do cálculo gravada na atividade (`potenciaEm`): mude para recalcular o histórico. */
export const VERSAO_DA_POTENCIA = 1;

export const PARAMETROS_POTENCIA = Object.freeze({
  pesoBikeKg: 9,
  crr: 0.005,
  cdaM2: 0.32,
  densidadeArKgM3: 1.2,
  eficienciaTransmissao: 0.975,
  gravidade: 9.80665,
});

/** Janela (s) de suavização da velocidade e da altitude: a altitude de GPS/barômetro é ruidosa. */
const JANELA_SUAVIZACAO_S = 10;
/** Acima de 20 m/s (72 km/h) no trecho, a velocidade é tratada como falha e descartada. */
const VELOCIDADE_MAXIMA_MS = 20;
/** Inclinação máxima aceita (±25%): acima disso a altitude é ruído. */
const GRADE_MAXIMA = 0.25;
/** Potência máxima plausível (W): acima disso a amostra é descartada. */
const POTENCIA_MAXIMA_W = 2000;
/** Intervalo máximo entre amostras (s) para contar como contínuo. */
const LACUNA_MAXIMA_S = 30;

/**
 * Potência (W) de um instante, no pedal.
 * @param {{ velMs: number, grade: number, aceleracaoMs2: number, massaKg: number }} p
 * @param {Partial<typeof PARAMETROS_POTENCIA>} [parametros]
 */
export function potenciaDoInstante({ velMs, grade, aceleracaoMs2, massaKg }, parametros = {}) {
  const { crr, cdaM2, densidadeArKgM3, eficienciaTransmissao, gravidade } = { ...PARAMETROS_POTENCIA, ...parametros };
  if (![velMs, grade, aceleracaoMs2, massaKg].every(Number.isFinite) || velMs <= 0) return 0;
  const angulo = Math.atan(grade);
  const rolagem = massaKg * gravidade * Math.cos(angulo) * crr;
  const subida = massaKg * gravidade * Math.sin(angulo);
  const arrasto = 0.5 * densidadeArKgM3 * cdaM2 * velMs * velMs;
  const inercia = massaKg * aceleracaoMs2;
  const potencia = ((rolagem + subida + arrasto + inercia) * velMs) / eficienciaTransmissao;
  return Math.min(POTENCIA_MAXIMA_W, Math.max(0, potencia));
}

/** Velocidade (m/s) de cada amostra: a do arquivo ou a derivada da distância; `null` quando não dá para saber. */
function velocidades(amostras) {
  return amostras.map((a, i) => {
    if (Number.isFinite(a.vel)) return a.vel;
    const ant = amostras[i - 1];
    if (ant && Number.isFinite(a.dist) && Number.isFinite(ant.dist) && a.t > ant.t) return (a.dist - ant.dist) / (a.t - ant.t);
    return null;
  });
}

/** Média móvel centrada por tempo (janela em s), ignorando `null`. */
function suavizar(amostras, valores, janelaS) {
  const saida = new Array(valores.length).fill(null);
  let ini = 0;
  let fim = 0;
  for (let i = 0; i < amostras.length; i++) {
    while (amostras[ini].t < amostras[i].t - janelaS / 2) ini++;
    while (fim < amostras.length && amostras[fim].t <= amostras[i].t + janelaS / 2) fim++;
    let soma = 0;
    let n = 0;
    for (let j = ini; j < fim; j++) {
      if (valores[j] === null || !Number.isFinite(valores[j])) continue;
      soma += valores[j];
      n++;
    }
    if (n > 0) saida[i] = soma / n;
  }
  return saida;
}

/**
 * Potência (W) por amostra, ou `null` onde falta dado. Precisa de velocidade (ou distância) em pelo menos duas amostras;
 * a altitude é opcional (sem ela, a subida vale zero).
 * @param {Array<{ t: number, vel?: number, dist?: number, alt?: number }>} amostras
 * @param {{ pesoKg: number } & Partial<typeof PARAMETROS_POTENCIA>} entrada
 * @returns {Array<number | null>}
 */
export function potenciaPorAmostra(amostras, { pesoKg, ...parametros }) {
  if (!Array.isArray(amostras) || amostras.length < 2 || !(pesoKg > 0)) return [];
  const p = { ...PARAMETROS_POTENCIA, ...parametros };
  const massaKg = pesoKg + p.pesoBikeKg;

  const velBruta = velocidades(amostras).map((v) => (v !== null && v >= 0 && v <= VELOCIDADE_MAXIMA_MS ? v : null));
  const vel = suavizar(amostras, velBruta, JANELA_SUAVIZACAO_S);
  const alt = suavizar(amostras, amostras.map((a) => (Number.isFinite(a.alt) ? a.alt : null)), JANELA_SUAVIZACAO_S);

  return amostras.map((a, i) => {
    const v = vel[i];
    const ant = amostras[i - 1];
    const dep = amostras[i + 1];
    if (v === null || !ant || !dep) return null;
    const dt = dep.t - ant.t;
    if (!(dt > 0) || dt > LACUNA_MAXIMA_S * 2) return null;
    const vAnt = vel[i - 1];
    const vDep = vel[i + 1];
    const aceleracaoMs2 = vAnt !== null && vDep !== null ? (vDep - vAnt) / dt : 0;
    let grade = 0;
    if (alt[i - 1] !== null && alt[i + 1] !== null) {
      const dx = ((vAnt ?? v) + (vDep ?? v)) / 2 * dt;
      if (dx > 1) grade = Math.max(-GRADE_MAXIMA, Math.min(GRADE_MAXIMA, (alt[i + 1] - alt[i - 1]) / dx));
    }
    return potenciaDoInstante({ velMs: v, grade, aceleracaoMs2, massaKg }, p);
  });
}

/** Média (W) da série pelo tempo de cada amostra (peso = intervalo até a anterior, limitado pela lacuna). */
function mediaPonderada(amostras, serie) {
  let soma = 0;
  let tempo = 0;
  for (let i = 1; i < amostras.length; i++) {
    const dt = amostras[i].t - amostras[i - 1].t;
    if (!(dt > 0) || dt > LACUNA_MAXIMA_S || serie[i] === null) continue;
    soma += serie[i] * dt;
    tempo += dt;
  }
  return tempo > 0 ? soma / tempo : null;
}

/** Série reamostrada a 1 Hz (zero-order hold; lacunas viram `null`), base da potência normalizada. */
function aUmHertz(amostras, serie) {
  const total = Math.floor(amostras[amostras.length - 1].t - amostras[0].t);
  const saida = [];
  let j = 0;
  for (let s = 0; s <= total; s++) {
    const alvo = amostras[0].t + s;
    while (j + 1 < amostras.length && amostras[j + 1].t <= alvo) j++;
    const vizinhaDepois = amostras[j + 1];
    const perto = alvo - amostras[j].t <= LACUNA_MAXIMA_S && (!vizinhaDepois || vizinhaDepois.t - amostras[j].t <= LACUNA_MAXIMA_S);
    saida.push(perto ? serie[j] : null);
  }
  return saida;
}

/** Potência normalizada (W): média de 4ª potência das médias móveis de 30 s. `null` com menos de 30 s de dados. */
export function potenciaNormalizada(amostras, serie) {
  const s = aUmHertz(amostras, serie);
  const janela = 30;
  if (s.length < janela) return null;
  let soma = 0;
  let n = 0;
  for (let i = janela - 1; i < s.length; i++) {
    let m = 0;
    let c = 0;
    for (let k = i - janela + 1; k <= i; k++) {
      if (s[k] === null) continue;
      m += s[k];
      c++;
    }
    if (c < janela * 0.8) continue;
    soma += (m / c) ** 4;
    n++;
  }
  return n > 0 ? (soma / n) ** 0.25 : null;
}

/** Melhor média (W) de uma janela de `duracaoS` segundos; `null` se a atividade é mais curta ou tem lacunas demais. */
export function melhorPotenciaNaJanela(amostras, serie, duracaoS) {
  const s = aUmHertz(amostras, serie);
  if (s.length < duracaoS) return null;
  let melhor = null;
  let soma = 0;
  let validos = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== null) {
      soma += s[i];
      validos++;
    }
    if (i >= duracaoS) {
      const saiu = s[i - duracaoS];
      if (saiu !== null) {
        soma -= saiu;
        validos--;
      }
    }
    if (i >= duracaoS - 1 && validos >= duracaoS * 0.9) {
      const media = soma / validos;
      if (melhor === null || media > melhor) melhor = media;
    }
  }
  return melhor;
}

const arredondar = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v));

/**
 * Resumo de potência da atividade, para gravar no documento. Só vale para ciclismo.
 *  - `potenciaOrigem`: `medida` quando o arquivo traz potência em pelo menos 50% das amostras; senão `estimada` (exige peso).
 *  - Sem dados suficientes, tudo `null` (e `potenciaOrigem` `null`).
 * @param {Array<{ t: number, vel?: number, dist?: number, alt?: number, pot?: number }>} amostras
 * @param {string} esporte
 * @param {{ pesoKg?: number | null } & Partial<typeof PARAMETROS_POTENCIA>} [opcoes]
 */
export function resumirPotencia(amostras, esporte, { pesoKg = null, ...parametros } = {}) {
  const vazio = { potenciaMediaW: null, potenciaNormalizadaW: null, potenciaMax5sW: null, potenciaMax1minW: null, potenciaMax5minW: null, potenciaMax20minW: null, potenciaOrigem: null };
  if (esporte !== 'ciclismo' || !Array.isArray(amostras) || amostras.length < 2) return vazio;

  const comMedida = amostras.filter((a) => Number.isFinite(a.pot) && a.pot >= 0 && a.pot <= POTENCIA_MAXIMA_W).length;
  let serie;
  let origem;
  if (comMedida >= amostras.length * 0.5) {
    serie = amostras.map((a) => (Number.isFinite(a.pot) && a.pot >= 0 && a.pot <= POTENCIA_MAXIMA_W ? a.pot : null));
    origem = 'medida';
  } else if (pesoKg > 0) {
    serie = potenciaPorAmostra(amostras, { pesoKg, ...parametros });
    origem = 'estimada';
  } else {
    return vazio;
  }
  if (serie.length === 0) return vazio;

  const media = mediaPonderada(amostras, serie);
  if (media === null) return vazio;
  return {
    potenciaMediaW: arredondar(media),
    potenciaNormalizadaW: arredondar(potenciaNormalizada(amostras, serie)),
    potenciaMax5sW: arredondar(melhorPotenciaNaJanela(amostras, serie, 5)),
    potenciaMax1minW: arredondar(melhorPotenciaNaJanela(amostras, serie, 60)),
    potenciaMax5minW: arredondar(melhorPotenciaNaJanela(amostras, serie, 300)),
    potenciaMax20minW: arredondar(melhorPotenciaNaJanela(amostras, serie, 1200)),
    potenciaOrigem: origem,
  };
}
