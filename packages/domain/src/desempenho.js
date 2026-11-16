import { LIMIAR_MOVIMENTO_KMH } from './atividade.js';
import { eficienciaAerobica, tendenciaLinear } from './evolucaoTrajeto.js';
import { diasEntre, somarDias } from './forma.js';
import { zonasGuardadas } from './zonasDaAtividade.js';

/**
 * Desempenho: o quanto de velocidade o atleta entrega por esforço cardíaco, e como isso evolui. Funções puras, sem Firebase
 * e sem DOM; calculadas a partir dos dados do próprio sistema (não dependem do intervals.icu nem do Garmin).
 *
 * Métricas: Fator de Eficiência (EF), batimentos por km, desacoplamento aeróbico (Pa:HR), ritmo em FC fixa, VDOT (corrida) e
 * esforço percebido (RPE) nos treinos comparáveis.
 */

export const ESPORTES_DE_DESEMPENHO = Object.freeze(['corrida', 'ciclismo']);
/** Janela da média móvel do EF (dias). */
export const JANELA_EFICIENCIA_DIAS = 28;

/**
 * Quais atividades entram nas médias. O EF só compara bem treinos parecidos: aeróbicos, sem tiros e em terreno pouco ondulado.
 * `intensoMaximo`: fração máxima do tempo em Z4–Z5, por esporte (o pedal tolera mais); `relevoMaximoMPorKm`: subida acumulada por km (sem ajuste de inclinação,
 * o relevo forte é excluído em vez de corrigido).
 */
export const CRITERIO_DE_EFICIENCIA = Object.freeze({
  tempoMinimoS: 20 * 60,
  distanciaMinimaM: 3000,
  intensoMaximo: Object.freeze({ corrida: 0.1, ciclismo: 0.25 }),
  relevoMaximoMPorKm: Object.freeze({ corrida: 15, ciclismo: 20 }),
});

/** Tempo mínimo (s) para medir o desacoplamento, e o aquecimento descartado no início. */
export const DESACOPLAMENTO = Object.freeze({ tempoMinimoS: 40 * 60, aquecimentoS: 10 * 60 });

export const MOTIVOS_DE_EXCLUSAO = Object.freeze({
  esporte: 'Só corrida e ciclismo entram',
  'sem-fc': 'Sem frequência cardíaca ou distância',
  curta: 'Curta demais (menos de 20 min ou 3 km)',
  'sem-zonas': 'Sem tempo por zona (atividade manual ou ainda não calculado)',
  intensa: 'Treino forte (muito tempo em Z4–Z5: mais de 10% na corrida e de 25% no pedal)',
  relevo: 'Muita subida para comparar',
  'em-grupo': 'Pedal em grupo (vácuo infla a velocidade)',
});

const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);
const variacaoPct = (de, para) => (finito(de) && finito(para) && de !== 0 ? ((para - de) / Math.abs(de)) * 100 : null);

/**
 * Avalia se a atividade entra nas médias de desempenho.
 * @returns {{ ok: true, ponto: object } | { ok: false, motivo: keyof typeof MOTIVOS_DE_EXCLUSAO }}
 */
export function avaliarAtividade(a) {
  if (!a || !ESPORTES_DE_DESEMPENHO.includes(a.esporte)) return { ok: false, motivo: 'esporte' };
  const tempoS = finito(a.tempoMovimentoS) && a.tempoMovimentoS > 0 ? a.tempoMovimentoS : a.duracaoS;
  const distanciaM = a.distanciaM;
  const fcMedia = a.fcMedia;
  if (!finito(tempoS) || !finito(distanciaM) || !finito(fcMedia) || fcMedia <= 0) return { ok: false, motivo: 'sem-fc' };
  if (tempoS < CRITERIO_DE_EFICIENCIA.tempoMinimoS || distanciaM < CRITERIO_DE_EFICIENCIA.distanciaMinimaM) return { ok: false, motivo: 'curta' };
  const zonas = zonasGuardadas(a);
  if (!zonas) return { ok: false, motivo: 'sem-zonas' };
  const total = zonas.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return { ok: false, motivo: 'sem-zonas' };
  if ((zonas[3] + zonas[4]) / total > CRITERIO_DE_EFICIENCIA.intensoMaximo[a.esporte]) return { ok: false, motivo: 'intensa' };
  if (finito(a.altimetriaM) && a.altimetriaM / (distanciaM / 1000) > CRITERIO_DE_EFICIENCIA.relevoMaximoMPorKm[a.esporte]) return { ok: false, motivo: 'relevo' };
  const etiquetas = a.feedback?.etiquetas;
  if (a.esporte === 'ciclismo' && Array.isArray(etiquetas) && etiquetas.includes('em-grupo')) return { ok: false, motivo: 'em-grupo' };

  const velocidadeMMin = distanciaM / (tempoS / 60);
  return {
    ok: true,
    ponto: {
      id: a.id,
      data: a.data,
      esporte: a.esporte,
      tempoS,
      distanciaM,
      fcMedia,
      velocidadeKmh: (distanciaM / tempoS) * 3.6,
      ef: eficienciaAerobica(distanciaM, tempoS, fcMedia),
      // total de batimentos do treino ÷ km: menor = mais barato para o coração
      bpmPorKm: (fcMedia * (tempoS / 60)) / (distanciaM / 1000),
      rpe: finito(a.feedback?.rpe) ? a.feedback.rpe : null,
      velocidadeMMin,
    },
  };
}

/**
 * Pontos de desempenho de um esporte, em ordem de data, e quantas atividades ficaram de fora por motivo.
 * @returns {{ pontos: object[], excluidas: Record<string, number> }}
 */
export function pontosDeDesempenho(atividades, esporte) {
  const pontos = [];
  const excluidas = {};
  for (const a of atividades ?? []) {
    if (a?.esporte !== esporte) continue;
    const r = avaliarAtividade(a);
    if (r.ok) pontos.push(r.ponto);
    else excluidas[r.motivo] = (excluidas[r.motivo] ?? 0) + 1;
  }
  pontos.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : String(x.id).localeCompare(String(y.id))));
  return { pontos, excluidas };
}

/** Esporte que as telas de desempenho mostram ao abrir, independente de quantos treinos cada esporte tem. */
export const ESPORTE_PADRAO_DE_DESEMPENHO = 'ciclismo';

const noIntervalo = (pontos, de, ate) => pontos.filter((p) => p.data >= de && p.data <= ate);
/** Média do EF ponderada pelo tempo de cada treino (treino longo pesa mais que o curto). */
const efPonderado = (pontos) => {
  const t = pontos.reduce((s, p) => s + p.tempoS, 0);
  return t > 0 ? pontos.reduce((s, p) => s + p.ef * p.tempoS, 0) / t : null;
};

/**
 * Série diária do EF suavizado: em cada dia, a média ponderada pelo tempo dos treinos dos últimos `janela` dias. Dias sem treino
 * na janela ficam com `null`. Começa no primeiro treino e vai até `ate`.
 * @returns {Array<{ data: string, eficiencia: number|null, n: number }>}
 */
export function serieDeEficiencia(pontos, { ate, janela = JANELA_EFICIENCIA_DIAS } = {}) {
  if (!pontos.length) return [];
  const fim = ate && ate > pontos[pontos.length - 1].data ? ate : pontos[pontos.length - 1].data;
  const saida = [];
  const total = diasEntre(pontos[0].data, fim);
  for (let i = 0; i <= total; i++) {
    const data = somarDias(pontos[0].data, i);
    const dentro = noIntervalo(pontos, somarDias(data, -(janela - 1)), data);
    saida.push({ data, eficiencia: efPonderado(dentro), n: dentro.length });
  }
  return saida;
}

/**
 * Acrescenta o campo `eficiencia` a cada dia de uma série (a do gráfico de Condicionamento e Fadiga), pela data.
 * Dias fora da série de EF ficam com `null`.
 */
export function anexarEficiencia(serie, serieEf) {
  const porData = new Map(serieEf.map((d) => [d.data, d.eficiencia]));
  return serie.map((d) => ({ ...d, eficiencia: porData.get(d.data) ?? null }));
}

/**
 * Leitura de uma variação do EF: melhora (≥ +2%), queda (≤ −2%) ou estável. Só vale como tendência, nunca como um treino isolado.
 */
export function leituraDaEficiencia(variacao) {
  if (!finito(variacao)) return { id: 'sem-dados', rotulo: 'Sem base para comparar', texto: 'Faltam treinos comparáveis nas duas janelas.' };
  if (variacao >= 2) return { id: 'melhorou', rotulo: 'Mais eficiente', texto: 'Você entrega mais velocidade para o mesmo esforço cardíaco do que no período anterior.' };
  if (variacao <= -2) return { id: 'piorou', rotulo: 'Menos eficiente', texto: 'A mesma velocidade custa mais batimentos. Calor, cansaço, sono ruim ou pausa nos treinos costumam explicar; olhe a tendência de várias semanas.' };
  return { id: 'estavel', rotulo: 'Estável', texto: 'Praticamente o mesmo rendimento por batimento do período anterior.' };
}

/**
 * Painel de desempenho de um esporte: janela recente × janela anterior (de `dias` dias cada, terminando em `hoje`).
 * @returns {object|null} null sem nenhum ponto
 */
export function resumoDeDesempenho(pontos, { hoje, dias = JANELA_EFICIENCIA_DIAS }) {
  if (!pontos.length) return null;
  const recenteDe = somarDias(hoje, -(dias - 1));
  const anteriorDe = somarDias(recenteDe, -dias);
  const anteriorAte = somarDias(recenteDe, -1);
  const rec = noIntervalo(pontos, recenteDe, hoje);
  const ant = noIntervalo(pontos, anteriorDe, anteriorAte);

  const efRecente = efPonderado(rec);
  const efAnterior = efPonderado(ant);
  const bpmKm = (lista) => {
    const km = lista.reduce((s, p) => s + p.distanciaM / 1000, 0);
    return km > 0 ? lista.reduce((s, p) => s + p.fcMedia * (p.tempoS / 60), 0) / km : null;
  };
  const velMedia = (lista) => {
    const t = lista.reduce((s, p) => s + p.tempoS, 0);
    return t > 0 ? (lista.reduce((s, p) => s + p.distanciaM, 0) / t) * 3.6 : null;
  };
  const rpeMedia = (lista) => media(lista.map((p) => p.rpe).filter(finito));

  const tendencia = tendenciaLinear(noIntervalo(pontos, somarDias(hoje, -180), hoje), (p) => p.ef);
  const eficiencia = { recente: efRecente, anterior: efAnterior, variacaoPct: variacaoPct(efAnterior, efRecente), nRecente: rec.length, nAnterior: ant.length };
  return {
    dias,
    eficiencia,
    leitura: leituraDaEficiencia(eficiencia.variacaoPct),
    melhorEf: pontos.reduce((a, b) => (b.ef > a.ef ? b : a)),
    tendenciaPorMes: tendencia?.inclinacaoPorMes ?? null,
    bpmPorKm: { recente: bpmKm(rec), anterior: bpmKm(ant), variacaoPct: variacaoPct(bpmKm(ant), bpmKm(rec)) },
    velocidade: { recente: velMedia(rec), anterior: velMedia(ant) },
    rpe: { recente: rpeMedia(rec), anterior: rpeMedia(ant), nRecente: rec.filter((p) => finito(p.rpe)).length, nAnterior: ant.filter((p) => finito(p.rpe)).length },
  };
}

/**
 * Ritmo em FC fixa: a FC "de referência" é a mediana da FC média dos treinos comparáveis (últimos 180 dias); a banda vai de
 * −`banda` a +`banda` bpm. Compara a velocidade média dos treinos dentro da banda na janela recente × anterior.
 * @returns {object|null} null com menos de 3 treinos para achar a referência
 */
export function ritmoEmFcFixa(pontos, { hoje, dias = 60, banda = 5 }) {
  const base = noIntervalo(pontos, somarDias(hoje, -180), hoje);
  if (base.length < 3) return null;
  const ordenadas = base.map((p) => p.fcMedia).sort((a, b) => a - b);
  const m = Math.floor(ordenadas.length / 2);
  const centro = Math.round(ordenadas.length % 2 ? ordenadas[m] : (ordenadas[m - 1] + ordenadas[m]) / 2);
  const naBanda = pontos.filter((p) => Math.abs(p.fcMedia - centro) <= banda);
  const recenteDe = somarDias(hoje, -(dias - 1));
  const anteriorDe = somarDias(recenteDe, -dias);
  const vel = (lista) => {
    const t = lista.reduce((s, p) => s + p.tempoS, 0);
    return t > 0 ? (lista.reduce((s, p) => s + p.distanciaM, 0) / t) * 3.6 : null;
  };
  const rec = noIntervalo(naBanda, recenteDe, hoje);
  const ant = noIntervalo(naBanda, anteriorDe, somarDias(recenteDe, -1));
  const r = vel(rec);
  const a = vel(ant);
  return { centro, banda, dias, recenteKmh: r, anteriorKmh: a, variacaoPct: variacaoPct(a, r), nRecente: rec.length, nAnterior: ant.length };
}

/**
 * Desacoplamento aeróbico (Pa:HR) de uma série detalhada: EF da 1ª metade menos o da 2ª, em % do da 1ª. Positivo = a FC "derivou"
 * para cima (cansaço, calor, base fraca); abaixo de 5% indica boa base aeróbica. Descarta o aquecimento e os trechos parados.
 * @param {{ t: number[], vel?: Array<number|null>, fc?: Array<number|null> }|null} serie `series/detalhe` (vel em km/h)
 * @param {string} esporte
 * @returns {null | { pct: number, ef1: number, ef2: number, amostras: number }} null sem FC e velocidade, ou com tempo útil curto
 */
export function desacoplamentoDaSerie(serie, esporte) {
  if (!serie?.t?.length || !serie.vel || !serie.fc) return null;
  const limiar = LIMIAR_MOVIMENTO_KMH[esporte] ?? LIMIAR_MOVIMENTO_KMH.outro;
  const t0 = serie.t[0];
  const duracao = serie.t[serie.t.length - 1] - t0;
  if (!(duracao >= DESACOPLAMENTO.tempoMinimoS)) return null;
  const validas = [];
  for (let i = 0; i < serie.t.length; i++) {
    const tempo = serie.t[i] - t0;
    if (tempo < DESACOPLAMENTO.aquecimentoS) continue;
    if (finito(serie.vel[i]) && serie.vel[i] > limiar && finito(serie.fc[i]) && serie.fc[i] >= 30) validas.push({ t: tempo, vel: serie.vel[i], fc: serie.fc[i] });
  }
  if (validas.length < 20) return null;
  const meio = (validas[0].t + validas[validas.length - 1].t) / 2;
  const ef = (lista) => {
    const fc = media(lista.map((x) => x.fc));
    const v = media(lista.map((x) => (x.vel * 1000) / 60)); // m/min
    return fc > 0 ? v / fc : null;
  };
  const primeira = validas.filter((x) => x.t <= meio);
  const segunda = validas.filter((x) => x.t > meio);
  if (primeira.length < 10 || segunda.length < 10) return null;
  const ef1 = ef(primeira);
  const ef2 = ef(segunda);
  if (!finito(ef1) || !finito(ef2) || ef1 <= 0) return null;
  return { pct: ((ef1 - ef2) / ef1) * 100, ef1, ef2, amostras: validas.length };
}

/** Leitura do desacoplamento (Pa:HR): abaixo de 5% é boa base; de 5 a 10%, em construção; acima de 10%, a FC deriva muito. */
export function leituraDoDesacoplamento(pct) {
  if (!finito(pct)) return null;
  if (pct < 5) return { id: 'bom', rotulo: 'Base aeróbica sólida', texto: 'A FC ficou estável em relação à velocidade ao longo do treino.' };
  if (pct <= 10) return { id: 'medio', rotulo: 'Base em construção', texto: 'A FC subiu um pouco no fim para manter a mesma velocidade. Mais volume leve costuma baixar isso.' };
  return { id: 'alto', rotulo: 'FC derivou bastante', texto: 'A FC subiu muito para sustentar a velocidade: ritmo forte para a base atual, calor ou cansaço.' };
}

/** Treinos longos e comparáveis em que vale medir o desacoplamento (a série detalhada precisa existir). */
export function candidatosAoDesacoplamento(atividades, esporte, { hoje, dias = 90, maximo = 12 }) {
  const de = somarDias(hoje, -(dias - 1));
  return (atividades ?? [])
    .filter((a) => a?.esporte === esporte && a.data >= de && a.data <= hoje && a.origem === 'arquivo' && a.detalheEm && avaliarAtividade(a).ok)
    .filter((a) => (finito(a.tempoMovimentoS) ? a.tempoMovimentoS : a.duracaoS) >= DESACOPLAMENTO.tempoMinimoS)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .slice(0, maximo);
}

/**
 * VDOT de Daniels a partir de uma distância e do tempo: o "nível" de corrida equivalente. Só vale para esforços máximos.
 * @param {number} distanciaM
 * @param {number} tempoS
 * @returns {number|null}
 */
export function vdotDaCorrida(distanciaM, tempoS) {
  if (!finito(distanciaM) || !finito(tempoS) || distanciaM <= 0 || tempoS <= 0) return null;
  const t = tempoS / 60;
  const v = distanciaM / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const fracao = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / fracao;
}

const DISTANCIAS_DE_ESFORCO = Object.freeze([
  { campo: 'melhor5kS', distanciaM: 5000 },
  { campo: 'melhor10kS', distanciaM: 10000 },
  { campo: 'melhor21kS', distanciaM: 21097.5 },
]);

/**
 * VDOT estimado pelos melhores esforços de corrida (5, 10 e 21 km): o maior VDOT entre as atividades da janela. Compara os
 * últimos `dias` dias com os `dias` anteriores. É uma estimativa: um treino leve dá um VDOT menor que o seu potencial.
 * @returns {{ recente: object|null, anterior: object|null, variacaoPct: number|null }}
 */
export function vdotDosMelhoresEsforcos(atividades, { hoje, dias = 90 }) {
  const melhor = (de, ate) => {
    let achado = null;
    for (const a of atividades ?? []) {
      if (a?.esporte !== 'corrida' || a.data < de || a.data > ate) continue;
      for (const { campo, distanciaM } of DISTANCIAS_DE_ESFORCO) {
        const v = vdotDaCorrida(distanciaM, a[campo]);
        if (v !== null && (!achado || v > achado.vdot)) achado = { vdot: v, data: a.data, distanciaM };
      }
    }
    return achado;
  };
  const recenteDe = somarDias(hoje, -(dias - 1));
  const recente = melhor(recenteDe, hoje);
  const anterior = melhor(somarDias(recenteDe, -dias), somarDias(recenteDe, -1));
  return { recente, anterior, variacaoPct: variacaoPct(anterior?.vdot, recente?.vdot) };
}
