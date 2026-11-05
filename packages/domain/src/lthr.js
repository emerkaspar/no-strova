import { validarConfigAtleta } from './configAtleta.js';

/**
 * Teste de LTHR (limiar de FC), no protocolo de 30 minutos de Joe Friel: depois de um bom aquecimento, 30 minutos
 * no maior esforço que você consegue sustentar, sozinho e em terreno constante. O LTHR é a FC média dos últimos
 * 20 minutos desses 30. Funções puras, sem Firebase e sem DOM.
 */
export const TESTE_LTHR = Object.freeze({
  janelaS: 30 * 60,
  finalS: 20 * 60,
  /** Fração mínima de amostras na janela (a série de FC pode ter buracos, como em pausas). */
  coberturaMinima: 0.85,
  /** Abaixo desta fração da FC máxima, o esforço provavelmente não foi máximo. */
  fracaoMinimaDaFcMax: 0.8,
  /** Diferença (bpm) para o LTHR atual a partir da qual vale um aviso. */
  diferencaParaAviso: 12,
});

/**
 * A melhor janela de 30 minutos (maior FC média) da série e o LTHR dela.
 * @param {{ t: number[], fc: number[] }} serie `t` em segundos desde o início (crescente), `fc` em bpm
 * @param {{ fcMax?: number, lthr?: number }|null} [config] só para gerar avisos
 * @returns {null | {
 *   lthr: number, mediaJanela: number, inicioS: number, fimS: number, fcMaxObservada: number, avisos: string[]
 * }} null quando a série não tem 30 minutos de FC
 */
export function analisarTesteLthr(serie, config = null) {
  const t = serie?.t ?? [];
  const fc = serie?.fc ?? [];
  const n = Math.min(t.length, fc.length);
  if (n < 2) return null;

  const { janelaS, finalS, coberturaMinima } = TESTE_LTHR;
  const passoTipico = (t[n - 1] - t[0]) / (n - 1);
  const esperadas = passoTipico > 0 ? janelaS / passoTipico : 0;

  const soma = [0];
  for (let i = 0; i < n; i++) soma.push(soma[i] + fc[i]);

  let melhor = null;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j + 1 < n && t[j + 1] - t[i] <= janelaS) j++;
    const amostras = j - i + 1;
    const vao = t[j] - t[i];
    // a janela precisa cobrir (quase) os 30 minutos e ter amostras suficientes
    if (vao < janelaS - 2 * passoTipico || amostras < coberturaMinima * esperadas) continue;
    const media = (soma[j + 1] - soma[i]) / amostras;
    if (melhor === null || media > melhor.media) melhor = { i, j, media };
  }
  if (melhor === null) return null;

  const fimS = t[melhor.j];
  let somaFinal = 0;
  let nFinal = 0;
  for (let k = melhor.i; k <= melhor.j; k++) {
    if (t[k] >= fimS - finalS) {
      somaFinal += fc[k];
      nFinal += 1;
    }
  }
  const lthr = Math.round(somaFinal / nFinal);
  const fcMaxObservada = Math.round(Math.max(...fc.slice(0, n)));

  const avisos = [];
  if (config?.fcMax && lthr < TESTE_LTHR.fracaoMinimaDaFcMax * Math.max(config.fcMax, fcMaxObservada)) {
    avisos.push('A FC média ficou baixa em relação à sua FC máxima: o esforço pode não ter sido o máximo sustentável. O LTHR sugerido pode estar abaixo do real.');
  }
  if (config?.lthr && Math.abs(lthr - config.lthr) >= TESTE_LTHR.diferencaParaAviso) {
    avisos.push(`O resultado difere ${Math.abs(lthr - config.lthr)} bpm do LTHR atual (${config.lthr} bpm). Confira se o teste foi feito como descrito.`);
  }
  return { lthr, mediaJanela: Math.round(melhor.media), inicioS: t[melhor.i], fimS, fcMaxObservada, avisos };
}

/**
 * Nova configuração de FC a partir do teste: parte da configuração-base, troca o LTHR (e, se pedido e maior, a FC
 * máxima) e vale a partir da data do teste.
 * @returns {{ valido: boolean, erros: string[], valores: object|null }} igual a validarConfigAtleta
 */
export function configAposTeste({ base, lthr, fcMaxObservada, atualizarFcMax, data }) {
  const fcMax = atualizarFcMax && fcMaxObservada > base.fcMax ? fcMaxObservada : base.fcMax;
  return validarConfigAtleta({
    vigenteDesde: data,
    fcMax,
    fcRepouso: base.fcRepouso,
    lthr,
    sexo: base.sexo,
    pesoKg: base.pesoKg,
    alturaCm: base.alturaCm,
  });
}

/**
 * Se uma atividade pode ser marcada (e analisada) como teste de LTHR: precisa ter vindo de arquivo, com FC,
 * e durar pelo menos os 30 minutos do protocolo. O mesmo critério vale no cartão de Configuração e no "Como foi?".
 * @param {{ origem?: string, fcMedia?: number|null, duracaoS?: number|null }} atividade
 * @returns {{ elegivel: boolean, motivo: string|null }}
 */
export function avaliarTesteLthr(atividade) {
  if (atividade?.origem !== 'arquivo' || !atividade.fcMedia) {
    return { elegivel: false, motivo: 'Só serve atividade importada de arquivo, com frequência cardíaca.' };
  }
  if ((atividade.duracaoS ?? 0) < TESTE_LTHR.janelaS) {
    return { elegivel: false, motivo: 'O teste precisa de pelo menos 30 minutos de atividade.' };
  }
  return { elegivel: true, motivo: null };
}
