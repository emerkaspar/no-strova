import { ZONAS } from './hrss.js';
import { ESPORTES_TREINO, FOCOS, LIMITES_TREINO_ESTRUTURADO, NIVEIS, formatarSegundos, validarTreinoEstruturado } from './treinosEstruturados.js';

/**
 * Treino adaptado ao trajeto: lê a altimetria da rota de referência, divide o terreno em subidas, planos e descidas,
 * e monta um treino por tempo em que a intensidade de cada trecho acompanha o terreno.
 * Funções puras, sem Firebase e sem DOM. A IA (no servidor) só escolhe a zona de cada trecho; os passos são montados aqui.
 */

export const TIPOS_DE_TERRENO = Object.freeze(['subida', 'plano', 'descida']);
export const ROTULOS_DO_TERRENO = Object.freeze({ subida: 'Subida', plano: 'Plano', descida: 'Descida' });

/** Estratégia única: o treino é montado a partir da melhor marca do usuário no trajeto (sem IA, sem foco, sem nível). */
export const ESTRATEGIA_RECORDE = 'recorde';

export const ESTRATEGIAS_TRAJETO = Object.freeze({
  [ESTRATEGIA_RECORDE]: { rotulo: 'Zerar o trajeto', descricao: 'Bater o seu recorde neste trajeto.' },
  subidas: { rotulo: 'Esforço nas subidas', descricao: 'Forte nas subidas; recuperação no plano e na descida.' },
  descidas_planos: { rotulo: 'Esforço nas descidas e planos', descricao: 'Forte onde o terreno ajuda (descida e plano); subida mais leve.' },
  equilibrada: { rotulo: 'Equilibrada', descricao: 'Forte na subida, ritmo firme no plano e recuperação na descida.' },
});

/** Focos que fazem sentido num trajeto (o teste de LTHR não é adaptado ao terreno). */
export const FOCOS_PARA_TRAJETO = Object.freeze(Object.keys(FOCOS).filter((f) => FOCOS[f].intensidade !== 'teste' && f !== 'recorde'));

export const PARAMETROS_DO_TERRENO = Object.freeze({
  passoM: 25, // reamostragem do perfil
  janelaGradientePassos: 3, // gradiente medido em ±3 passos (±75 m)
  limiarEntradaPct: 3, // a partir de 3% vira subida (ou descida)
  limiarSaidaPct: 1.5, // só volta a ser plano abaixo de 1,5% (histerese)
  reclassificarAbaixoPct: 2, // um trecho que, depois de fundido, ficou abaixo disto vira plano
  trechoMinimoM: 200,
  trechoMinimoS: 30,
  suavizacaoM: 30, // média da altitude em ±30 m
  desnivelMinimoM: 30, // abaixo disto o trajeto é plano demais para um treino adaptado
  distanciaMinimaM: 500,
});

const ZONAS_ORDEM = Object.freeze(Object.keys(ZONAS)); // Z1..Z5
const ZONA_DE_ESFORCO = Object.freeze({ vo2max: 'Z5', limiar: 'Z4', tempo: 'Z3', overunder: 'Z4', piramide: 'Z4', fartlek: 'Z4', sprint: 'Z5', progressivo: 'Z3', subidas: 'Z4', recuperacao: 'Z2', resistencia: 'Z2' });
const TETO_DE_ZONA = Object.freeze({ vo2max: 'Z5', limiar: 'Z4', tempo: 'Z4', overunder: 'Z5', piramide: 'Z5', fartlek: 'Z5', sprint: 'Z5', progressivo: 'Z4', subidas: 'Z5', recuperacao: 'Z2', resistencia: 'Z2' });

const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const indiceDaZona = (z) => ZONAS_ORDEM.indexOf(z);
const zonaDoIndice = (i) => ZONAS_ORDEM[Math.max(0, Math.min(ZONAS_ORDEM.length - 1, i))];
const arredondar = (v, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;

/**
 * Perfil do trecho do trajeto, com a distância e o tempo contados do início do trecho e a altitude suavizada.
 * @param {{ t: number[], dist?: Array<number|null>, alt?: Array<number|null> }} serie série detalhada da atividade de referência (dist em km)
 * @param {number} iniM início do trecho, em metros da atividade
 * @param {number} fimM fim do trecho, em metros da atividade
 * @returns {null | { dM: number[], alt: number[], tS: number[], origemM: number }} null sem distância, altitude ou tempo suficientes
 *   (`origemM`: a distância, na atividade, onde o perfil começa)
 */
export function perfilDoTrajeto(serie, iniM, fimM) {
  if (!serie?.t || !serie.dist || !serie.alt || !finito(iniM) || !finito(fimM) || !(fimM > iniM)) return null;
  const bruto = [];
  let ultimaD = -Infinity;
  for (let i = 0; i < serie.t.length; i++) {
    const d = serie.dist[i];
    const a = serie.alt[i];
    const t = serie.t[i];
    if (!finito(d) || !finito(a) || !finito(t)) continue;
    const dM = d * 1000;
    if (dM < iniM || dM > fimM || dM <= ultimaD) continue; // fora do trecho, parado ou voltando
    ultimaD = dM;
    bruto.push({ dM, a, t });
  }
  if (bruto.length < 10) return null;
  const d0 = bruto[0].dM;
  const t0 = bruto[0].t;
  const dM = bruto.map((p) => p.dM - d0);
  const tS = bruto.map((p) => p.t - t0);
  const raio = PARAMETROS_DO_TERRENO.suavizacaoM;
  const alt = bruto.map((_, i) => {
    let soma = 0;
    let n = 0;
    for (let j = i; j >= 0 && dM[i] - dM[j] <= raio; j--) { soma += bruto[j].a; n++; }
    for (let j = i + 1; j < bruto.length && dM[j] - dM[i] <= raio; j++) { soma += bruto[j].a; n++; }
    return soma / n;
  });
  return { dM, alt, tS, origemM: d0 };
}

/** Valor de `ys` na distância `x`, por interpolação linear (`xs` crescente). */
function interpolar(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const meio = (lo + hi) >> 1;
    if (xs[meio] <= x) lo = meio; else hi = meio;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

function classificarPassos(grad, P) {
  const tipos = [];
  let atual = null;
  for (const g of grad) {
    if (atual === 'subida' && g >= P.limiarSaidaPct) { tipos.push('subida'); continue; }
    if (atual === 'descida' && g <= -P.limiarSaidaPct) { tipos.push('descida'); continue; }
    atual = g >= P.limiarEntradaPct ? 'subida' : g <= -P.limiarEntradaPct ? 'descida' : 'plano';
    tipos.push(atual);
  }
  return tipos;
}

/**
 * Divide o perfil em subidas, planos e descidas.
 * @param {{ dM: number[], alt: number[], tS: number[] }} perfil
 * @returns {{ segmentos: Array<{ id: string, tipo: string, iniM: number, fimM: number, distanciaM: number, ganhoM: number, gradienteMedio: number, duracaoS: number }>,
 *   resumo: { distanciaM: number, duracaoS: number, ganhoTotalM: number, perdaTotalM: number, relevante: boolean },
 *   perfil: { dM: number[], alt: number[] } }}
 */
export function segmentarTerreno(perfil, opcoes = {}) {
  const P = { ...PARAMETROS_DO_TERRENO, ...opcoes };
  const total = perfil.dM[perfil.dM.length - 1];
  const n = Math.max(1, Math.ceil(total / P.passoM));
  const marcos = Array.from({ length: n + 1 }, (_, k) => Math.min(total, k * P.passoM));
  const alt = marcos.map((d) => interpolar(perfil.dM, perfil.alt, d));
  const tempo = marcos.map((d) => interpolar(perfil.dM, perfil.tS, d));
  const altEm = (d) => interpolar(marcos, alt, d);
  const tempoEm = (d) => interpolar(marcos, tempo, d);

  const grad = [];
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - P.janelaGradientePassos);
    const b = Math.min(n, k + 1 + P.janelaGradientePassos);
    grad.push(marcos[b] > marcos[a] ? ((alt[b] - alt[a]) / (marcos[b] - marcos[a])) * 100 : 0);
  }
  const tiposDosPassos = classificarPassos(grad, P);

  let lista = [];
  tiposDosPassos.forEach((tipo, k) => {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.fimM = marcos[k + 1];
    else lista.push({ tipo, iniM: marcos[k], fimM: marcos[k + 1] });
  });

  const comprimento = (s) => s.fimM - s.iniM;
  const duracao = (s) => tempoEm(s.fimM) - tempoEm(s.iniM);
  const gradiente = (s) => (comprimento(s) > 0 ? ((altEm(s.fimM) - altEm(s.iniM)) / comprimento(s)) * 100 : 0);
  const fundirIguais = () => {
    const saida = [];
    for (const s of lista) {
      const ultimo = saida[saida.length - 1];
      if (ultimo && ultimo.tipo === s.tipo) ultimo.fimM = s.fimM;
      else saida.push({ ...s });
    }
    lista = saida;
  };

  for (let volta = 0; volta < 50; volta++) {
    const antes = lista.length;
    // trechos curtos demais são absorvidos pelo vizinho maior
    let curto = lista.findIndex((s) => lista.length > 1 && (comprimento(s) < P.trechoMinimoM || duracao(s) < P.trechoMinimoS));
    while (curto !== -1) {
      const anterior = lista[curto - 1];
      const proximo = lista[curto + 1];
      const alvo = !anterior ? proximo : !proximo ? anterior : comprimento(anterior) >= comprimento(proximo) ? anterior : proximo;
      const s = lista[curto];
      alvo.iniM = Math.min(alvo.iniM, s.iniM);
      alvo.fimM = Math.max(alvo.fimM, s.fimM);
      lista.splice(curto, 1);
      fundirIguais();
      curto = lista.findIndex((x) => lista.length > 1 && (comprimento(x) < P.trechoMinimoM || duracao(x) < P.trechoMinimoS));
    }
    // um trecho que, depois de fundido, ficou quase sem inclinação passa a ser plano
    let mudou = false;
    for (const s of lista) {
      if (s.tipo !== 'plano' && Math.abs(gradiente(s)) < P.reclassificarAbaixoPct) { s.tipo = 'plano'; mudou = true; }
    }
    fundirIguais();
    if (!mudou && lista.length === antes) break;
  }

  let acumuladoS = 0;
  const segmentos = lista.map((s, i) => {
    const fimS = Math.round(tempoEm(s.fimM));
    const duracaoS = Math.max(1, fimS - acumuladoS);
    acumuladoS = fimS;
    return {
      id: `s${i + 1}`,
      tipo: s.tipo,
      iniM: Math.round(s.iniM),
      fimM: Math.round(s.fimM),
      distanciaM: Math.round(comprimento(s)),
      ganhoM: arredondar(altEm(s.fimM) - altEm(s.iniM)),
      gradienteMedio: arredondar(gradiente(s)),
      duracaoS,
    };
  });
  const ganhoTotalM = arredondar(segmentos.reduce((t, s) => t + Math.max(0, s.ganhoM), 0));
  const perdaTotalM = arredondar(segmentos.reduce((t, s) => t + Math.max(0, -s.ganhoM), 0));
  const resumo = {
    distanciaM: Math.round(total),
    duracaoS: Math.round(tempo[tempo.length - 1]),
    ganhoTotalM,
    perdaTotalM,
    relevante: total >= P.distanciaMinimaM && Math.max(ganhoTotalM, perdaTotalM) >= P.desnivelMinimoM && segmentos.some((s) => s.tipo !== 'plano'),
  };
  return { segmentos, resumo, perfil: { dM: marcos.map((d) => Math.round(d)), alt: alt.map((a) => arredondar(a)) } };
}

/** Zona de esforço do foco (a zona do trabalho forte) e o teto que a IA não pode ultrapassar. */
export const zonaDeEsforcoDoFoco = (foco) => ZONA_DE_ESFORCO[foco] ?? 'Z4';
export const tetoDeZonaDoFoco = (foco) => TETO_DE_ZONA[foco] ?? 'Z5';

/**
 * Decisões sem IA: uma zona e um papel (principal ou recuperacao) para cada segmento, pela estratégia.
 * @returns {Array<{ segmentoId: string, zona: string, papel: 'principal'|'recuperacao', motivo: string }>}
 */
export function decisoesPadrao(segmentos, estrategia = 'subidas', foco = 'limiar') {
  const esforco = indiceDaZona(zonaDeEsforcoDoFoco(foco));
  const recuperacaoAtiva = zonaDoIndice(Math.max(0, Math.min(1, esforco - 1)));
  const recuperacaoTotal = zonaDoIndice(0);
  const intermediaria = zonaDoIndice(Math.max(Math.min(2, esforco), esforco - 1));
  const forte = (s, motivo) => ({ segmentoId: s.id, zona: zonaDoIndice(esforco), papel: 'principal', motivo });
  const solta = (s, zona, motivo) => ({ segmentoId: s.id, zona, papel: 'recuperacao', motivo });

  const decisoes = segmentos.map((s) => {
    if (estrategia === 'descidas_planos') {
      if (s.tipo === 'subida') return solta(s, recuperacaoAtiva, 'Subida: ritmo controlado para renovar o esforço.');
      return forte(s, s.tipo === 'descida' ? 'Descida: o terreno ajuda a manter o esforço alto.' : 'Plano: bom para sustentar o esforço.');
    }
    if (estrategia === 'equilibrada') {
      if (s.tipo === 'subida') return forte(s, 'Subida: esforço máximo do treino.');
      if (s.tipo === 'descida') return solta(s, recuperacaoTotal, 'Descida: recuperação.');
      const zona = intermediaria;
      return indiceDaZona(zona) >= 2 ? { segmentoId: s.id, zona, papel: 'principal', motivo: 'Plano: ritmo firme, abaixo do esforço da subida.' } : solta(s, zona, 'Plano: recuperação ativa.');
    }
    if (s.tipo === 'subida') return forte(s, 'Subida: o esforço forte entra aqui.');
    return s.tipo === 'descida' ? solta(s, recuperacaoTotal, 'Descida: recuperação.') : solta(s, recuperacaoAtiva, 'Plano: recuperação ativa.');
  });
  return garantirEsforco(segmentos, decisoes, esforco);
}

/** Se nenhum trecho ficou como esforço (ex.: estratégia de subidas num trajeto só com descidas), o trecho mais longo vira o esforço. */
function garantirEsforco(segmentos, decisoes, esforco) {
  if (decisoes.some((d) => d.papel === 'principal')) return decisoes;
  const maisLongo = segmentos.reduce((m, s) => (s.duracaoS > m.duracaoS ? s : m), segmentos[0]);
  return decisoes.map((d) => (d.segmentoId === maisLongo.id ? { ...d, zona: zonaDoIndice(esforco), papel: 'principal', motivo: 'Trecho mais longo: esforço do treino.' } : d));
}

/**
 * Confere as decisões (da IA, por exemplo): cada segmento recebe a decisão válida ou, na falta dela, a padrão.
 * Respeita o teto de zona do foco, e a zona precisa combinar com o papel (esforço a partir de Z3, recuperação até Z2).
 */
export function normalizarDecisoes(segmentos, decisoes, { estrategia = 'subidas', foco = 'limiar' } = {}) {
  const padrao = new Map(decisoesPadrao(segmentos, estrategia, foco).map((d) => [d.segmentoId, d]));
  const recebidas = new Map((Array.isArray(decisoes) ? decisoes : []).map((d) => [d?.segmentoId, d]));
  const teto = indiceDaZona(tetoDeZonaDoFoco(foco));
  const lista = segmentos.map((s) => {
    const d = recebidas.get(s.id);
    if (!d || !ZONAS_ORDEM.includes(d.zona) || !['principal', 'recuperacao'].includes(d.papel)) return padrao.get(s.id);
    let i = Math.min(indiceDaZona(d.zona), teto);
    if (d.papel === 'recuperacao') i = Math.min(i, 1);
    else i = Math.max(i, Math.min(2, teto));
    const motivo = typeof d.motivo === 'string' && d.motivo.trim() ? d.motivo.trim().slice(0, 140) : padrao.get(s.id).motivo;
    return { segmentoId: s.id, zona: zonaDoIndice(i), papel: d.papel, motivo };
  });
  return garantirEsforco(segmentos, lista, indiceDaZona(zonaDeEsforcoDoFoco(foco)));
}

const formatarDistancia = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
const formatarMetros = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} m`;

function descreverBloco(segs) {
  if (segs.length === 1) {
    const s = segs[0];
    return `${ROTULOS_DO_TERRENO[s.tipo]} de ${formatarDistancia(s.distanciaM)} (${formatarMetros(s.ganhoM)})${s.meta ? ` · meta ${s.meta}` : ''}`.slice(0, 120);
  }
  const tipos = [...new Set(segs.map((s) => ROTULOS_DO_TERRENO[s.tipo].toLowerCase()))];
  const distancia = segs.reduce((t, s) => t + s.distanciaM, 0);
  const ganho = segs.reduce((t, s) => t + s.ganhoM, 0);
  return `${tipos.join(' + ')}, ${formatarDistancia(distancia)} (${formatarMetros(ganho)})`.slice(0, 120);
}

/**
 * Passos do treino: um bloco por segmento, fundindo os vizinhos de mesma zona e papel e, se passar do limite de passos,
 * os vizinhos mais curtos. O treino é por tempo: cada bloco dura o que o usuário levou naquele trecho na rota de referência.
 */
function montarPassos(segmentos, decisoes, foco) {
  const porId = new Map(decisoes.map((d) => [d.segmentoId, d]));
  let blocos = [];
  for (const s of segmentos) {
    const d = porId.get(s.id);
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.zona === d.zona && ultimo.papel === d.papel && !s.meta) {
      ultimo.duracaoS += s.duracaoS;
      ultimo.segs.push(s);
    } else {
      blocos.push({ papel: d.papel, zona: d.zona, duracaoS: s.duracaoS, segs: [s] });
    }
  }
  const maximo = LIMITES_TREINO_ESTRUTURADO.passos.max;
  while (blocos.length > maximo) {
    let melhor = 0;
    for (let i = 1; i < blocos.length - 1; i++) {
      if (blocos[i].duracaoS + blocos[i + 1].duracaoS < blocos[melhor].duracaoS + blocos[melhor + 1].duracaoS) melhor = i;
    }
    const [a, b] = [blocos[melhor], blocos[melhor + 1]];
    const dominante = a.duracaoS >= b.duracaoS ? a : b;
    const fundido = { papel: dominante.papel, zona: dominante.zona, duracaoS: a.duracaoS + b.duracaoS, segs: [...a.segs, ...b.segs] };
    blocos.splice(melhor, 2, fundido);
    // dois blocos vizinhos podem ficar iguais depois da fusão
    blocos = blocos.reduce((saida, bloco) => {
      const u = saida[saida.length - 1];
      if (u && u.zona === bloco.zona && u.papel === bloco.papel) { u.duracaoS += bloco.duracaoS; u.segs.push(...bloco.segs); } else saida.push(bloco);
      return saida;
    }, []);
  }
  if (!blocos.some((b) => b.papel === 'principal') && blocos.length > 0) {
    const maior = blocos.reduce((m, b) => (b.duracaoS > m.duracaoS ? b : m), blocos[0]);
    maior.papel = 'principal';
    maior.zona = zonaDoIndice(Math.max(indiceDaZona(maior.zona), Math.min(2, indiceDaZona(tetoDeZonaDoFoco(foco)))));
  }
  return blocos.map((b) => ({ tipo: 'bloco', papel: b.papel, duracaoS: Math.max(LIMITES_TREINO_ESTRUTURADO.duracaoPassoS.min, Math.round(b.duracaoS)), zona: b.zona, descricao: descreverBloco(b.segs) }));
}

/**
 * Monta o treino do trajeto a partir dos segmentos e das decisões (da IA ou padrão).
 * @param {object[]} segmentos de `segmentarTerreno`
 * @param {object[]|null} decisoes se nulo ou incompleto, usa as decisões padrão da estratégia
 * @param {{ esporte: string, foco: string, nivel: string, estrategia: string, trajetoNome: string, nome?: string, descricao?: string }} contexto
 * @returns {{ valido: boolean, erros: string[], treino: null | { nome: string, esporte: string, foco: string, nivel: string, descricao: string, passos: any[] },
 *   segmentos: object[] }} `segmentos` traz a zona, o papel e o motivo de cada trecho
 */
export function montarTreinoDoTerreno(segmentos, decisoes, contexto) {
  const { esporte, foco, nivel, estrategia, trajetoNome } = contexto;
  const erros = [];
  if (!ESPORTES_TREINO.includes(esporte)) erros.push('Escolha o esporte (ciclismo ou corrida).');
  if (!FOCOS_PARA_TRAJETO.includes(foco)) erros.push('Escolha o foco do treino.');
  if (!NIVEIS[nivel]) erros.push('Escolha o nível do treino.');
  if (!ESTRATEGIAS_TRAJETO[estrategia]) erros.push('Escolha a estratégia de esforço.');
  if (!Array.isArray(segmentos) || segmentos.length === 0) erros.push('O trajeto não tem trechos.');
  if (erros.length > 0) return { valido: false, erros, treino: null, segmentos: [] };

  const finais = normalizarDecisoes(segmentos, decisoes, { estrategia, foco });
  return finalizarTreino(segmentos, finais, { esporte, foco, nivel, trajetoNome, nome: contexto.nome, descricao: contexto.descricao });
}

const GUIA_DE_INICIO = 'Comece no ponto de partida do trajeto, depois de aquecer 10 a 15 min em Z1–Z2 (o treino cobre só o percurso). Os tempos seguem o seu ritmo nesse trajeto.';

/** Monta os passos das decisões já conferidas e valida o treino. */
function finalizarTreino(segmentos, finais, { esporte, foco, nivel, trajetoNome, nome: nomeEscolhido, descricao: descricaoEscolhida }) {
  const passos = montarPassos(segmentos, finais, foco);
  const porId = new Map(finais.map((d) => [d.segmentoId, d]));
  const segmentosDecididos = segmentos.map((s) => ({ ...s, zona: porId.get(s.id).zona, papel: porId.get(s.id).papel, motivo: porId.get(s.id).motivo }));

  const L = LIMITES_TREINO_ESTRUTURADO;
  const nomePadrao = `${FOCOS[foco].rotulo} · ${trajetoNome ?? 'Trajeto'}`;
  const nome = String(nomeEscolhido ?? '').trim().slice(0, L.nome.max) || nomePadrao.slice(0, L.nome.max);
  const descricao = [String(descricaoEscolhida ?? '').trim(), GUIA_DE_INICIO].filter(Boolean).join(' ').slice(0, L.descricao.max);

  const validacao = validarTreinoEstruturado({ nome, esporte, foco, nivel, descricao, passos });
  if (!validacao.valido) return { valido: false, erros: validacao.erros, treino: null, segmentos: segmentosDecididos };
  return { valido: true, erros: [], treino: validacao.valores, segmentos: segmentosDecididos };
}

// ---------------------------------------------------------------------------------------------------------------
// Zerar o trajeto: bater o recorde do usuário
// ---------------------------------------------------------------------------------------------------------------

/** A meta é ficar 1% mais rápido que o recorde, e nunca menos de 5 s. */
export const META_DO_RECORDE = Object.freeze({ fracao: 0.01, minimoS: 5 });

/** Tempo-meta (s) para bater o recorde. */
export function metaDoRecorde(recordeS) {
  return Math.max(1, Math.round(recordeS - Math.max(META_DO_RECORDE.minimoS, recordeS * META_DO_RECORDE.fracao)));
}

/** Zona de FC (Z1–Z5) de uma FC, pelas faixas de % do LTHR. Null sem FC ou sem LTHR. */
export function zonaPelaFc(fc, lthr) {
  if (!finito(fc) || !finito(lthr) || lthr <= 0) return null;
  const f = fc / lthr;
  return f < 0.8 ? 'Z1' : f < 0.89 ? 'Z2' : f < 0.945 ? 'Z3' : f < 1 ? 'Z4' : 'Z5';
}

/** FC média de cada segmento na série da atividade (null onde faltam dados). */
export function fcMediaPorSegmento(serie, perfil, segmentos) {
  if (!serie?.fc || !serie.dist) return segmentos.map(() => null);
  const base = perfil.origemM ?? 0;
  return segmentos.map((s) => {
    const valores = [];
    for (let i = 0; i < serie.dist.length; i++) {
      const d = serie.dist[i] * 1000;
      if (finito(d) && d >= base + s.iniM && d <= base + s.fimM && finito(serie.fc[i])) valores.push(serie.fc[i]);
    }
    return valores.length >= 3 ? valores.reduce((t, v) => t + v, 0) / valores.length : null;
  });
}

/** Ritmo (corrida, "5:12/km") ou velocidade (ciclismo, "28,4 km/h") de um trecho. */
export function ritmoDoTrecho(esporte, distanciaM, duracaoS) {
  if (!(distanciaM > 0) || !(duracaoS > 0)) return '';
  if (esporte === 'corrida') {
    const s = Math.round(duracaoS / (distanciaM / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
  }
  return `${((distanciaM / duracaoS) * 3.6).toFixed(1).replace('.', ',')} km/h`;
}

const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? String(iso).split('-').reverse().join('/') : '');
const minutosESegundos = (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;

/**
 * Treino para bater o recorde do trajeto. Os segmentos são os da própria passagem do recorde (com o tempo dela); cada um
 * recebe a meta de tempo e de ritmo, em que o trajeto todo fecha cerca de 1% mais rápido (`metaDoRecorde`). A zona de cada
 * trecho é a FC que o usuário teve nele no recorde (esforço de prova: ao menos Z3, exceto descida em que ele recuperou).
 * Sem FC, usa Z4 na subida e no plano e Z3 na descida.
 * @param {object[]} segmentos de `segmentarTerreno`, com a duração do recorde
 * @param {{ esporte: string, nivel: string, trajetoNome: string, recordeS: number, recordeData?: string,
 *   fcPorSegmento?: Array<number|null>, lthr?: number|null }} contexto `recordeS`: o tempo do recorde (parado não conta)
 * @returns mesma forma de `montarTreinoDoTerreno`, mais `meta: { recordeS, metaS, ganhoS, semFc }`
 */
export function montarTreinoRecorde(segmentos, contexto) {
  const { esporte, nivel, trajetoNome, recordeS, recordeData, fcPorSegmento = [], lthr = null } = contexto;
  const erros = [];
  if (!ESPORTES_TREINO.includes(esporte)) erros.push('Escolha o esporte (ciclismo ou corrida).');
  if (!NIVEIS[nivel]) erros.push('Escolha o nível do treino.');
  if (!Array.isArray(segmentos) || segmentos.length === 0 || !(recordeS > 0)) erros.push('Não há dados do recorde para montar o treino.');
  if (erros.length > 0) return { valido: false, erros, treino: null, segmentos: [], meta: null };

  const metaS = metaDoRecorde(recordeS);
  const somaS = segmentos.reduce((t, s) => t + s.duracaoS, 0);
  let acumulado = 0;
  let fim = 0;
  const alvo = segmentos.map((s) => {
    acumulado += (s.duracaoS * metaS) / somaS;
    const duracaoS = Math.max(1, Math.round(acumulado) - fim);
    fim += duracaoS;
    return { ...s, duracaoS, meta: ritmoDoTrecho(esporte, s.distanciaM, duracaoS) };
  });

  let semFc = false;
  const finais = alvo.map((s, i) => {
    const fc = fcPorSegmento[i];
    const zonaDaFc = zonaPelaFc(fc, lthr);
    let zona = zonaDaFc;
    if (!zona) {
      semFc = true;
      zona = s.tipo === 'descida' ? 'Z3' : 'Z4';
    }
    const indice = indiceDaZona(zona);
    const recupera = zonaDaFc !== null && s.tipo === 'descida' && indice <= 1;
    const origemDaZona = zonaDaFc ? `no recorde a sua FC média foi ${Math.round(fc)} bpm (${zonaDaFc})` : 'sem FC no recorde, zona estimada pelo terreno';
    return {
      segmentoId: s.id,
      zona: recupera ? zona : zonaDoIndice(Math.max(indice, 2)),
      papel: recupera ? 'recuperacao' : 'principal',
      motivo: `Meta ${s.meta}: ${origemDaZona}.`,
    };
  });

  const data = dataBr(recordeData);
  const descricao = `Recorde atual: ${minutosESegundos(recordeS)}${data ? ` (${data})` : ''}. Meta: ${minutosESegundos(metaS)}, ${Math.round(recordeS - metaS)} s mais rápido, mantendo o seu esforço de cada trecho e ganhando o tempo no ritmo.`;
  const montado = finalizarTreino(alvo, finais, { esporte, foco: 'recorde', nivel, trajetoNome, nome: `Zerar o trajeto · ${trajetoNome ?? 'Trajeto'}`, descricao });
  return { ...montado, meta: { recordeS, metaS, ganhoS: recordeS - metaS, semFc } };
}

/** Resumo em uma linha de um segmento, para o prompt da IA e para a tela. */
export function descreverSegmento(s) {
  return `${ROTULOS_DO_TERRENO[s.tipo]} de ${formatarDistancia(s.distanciaM)}, ${formatarMetros(s.ganhoM)} (${String(s.gradienteMedio).replace('.', ',')}%), ${formatarSegundos(s.duracaoS)}`;
}
