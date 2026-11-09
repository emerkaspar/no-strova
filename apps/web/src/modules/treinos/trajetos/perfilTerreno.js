import { descreverSegmento, ROTULOS_DO_TERRENO } from '@no-strova/domain';

const NS = 'http://www.w3.org/2000/svg';
const L = 640;
const MARGEM = { topo: 14, direita: 10, base: 30, esquerda: 44 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

let contador = 0;

/** Poucos pontos (no máximo `n`) do perfil, sempre com o primeiro e o último. */
function reduzir(pontos, n) {
  if (pontos.length <= n) return pontos;
  const passo = (pontos.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => pontos[Math.round(i * passo)]);
}

/** Curvas de Bézier (Catmull-Rom) entre cada par de pontos; o y nunca sai de [yMin, yMax]. */
function curvasSuaves(pontos, yMin, yMax) {
  const preso = (y) => Math.max(yMin, Math.min(yMax, y));
  const curvas = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;
    curvas.push({
      p1,
      p2,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, preso(p1[1] + (p2[1] - p0[1]) / 6)],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, preso(p2[1] - (p3[1] - p1[1]) / 6)],
    });
  }
  return curvas;
}

const n1 = (v) => v.toFixed(1);
const trechoDaCurva = (c) => `M${n1(c.p1[0])},${n1(c.p1[1])} C${n1(c.c1[0])},${n1(c.c1[1])} ${n1(c.c2[0])},${n1(c.c2[1])} ${n1(c.p2[0])},${n1(c.p2[1])}`;

/** Caminho suave único pelos pontos (para a área sob a curva). */
function caminhoSuave(pontos, yMin, yMax) {
  const curvas = curvasSuaves(pontos, yMin, yMax);
  if (curvas.length === 0) return '';
  return curvas.reduce((d, c) => `${d} C${n1(c.c1[0])},${n1(c.c1[1])} ${n1(c.c2[0])},${n1(c.c2[1])} ${n1(c.p2[0])},${n1(c.p2[1])}`, `M${n1(pontos[0][0])},${n1(pontos[0][1])}`);
}

/** Limites (em %) entre as faixas de inclinação: descida forte, descida, plano, subida leve, média, forte e muito forte. */
const LIMITES_DE_INCLINACAO = [-8, -3, 3, 6, 9, 12];

/** Faixas de inclinação, da descida mais forte à subida mais forte, com o rótulo para a legenda. */
export const FAIXAS_DE_INCLINACAO = Object.freeze([
  { classe: 'inclina-0', rotulo: 'descida forte' },
  { classe: 'inclina-1', rotulo: 'descida' },
  { classe: 'inclina-2', rotulo: 'plano' },
  { classe: 'inclina-3', rotulo: 'subida leve' },
  { classe: 'inclina-4', rotulo: 'subida' },
  { classe: 'inclina-5', rotulo: 'subida forte' },
  { classe: 'inclina-6', rotulo: 'rampa' },
]);

/** Classe de cor (inclina-0 a inclina-6) de uma inclinação em %. */
export function classeDaInclinacao(pct) {
  const i = LIMITES_DE_INCLINACAO.findIndex((l) => pct < l);
  return `inclina-${i === -1 ? LIMITES_DE_INCLINACAO.length : i}`;
}

/** Inclinação (%) de cada par de pontos, suavizada com os vizinhos para o traço não piscar de cor. */
function inclinacoes(amostra) {
  const brutas = amostra.slice(1).map((p, i) => {
    const dd = p.d - amostra[i].d;
    return dd > 0 ? ((p.a - amostra[i].a) / dd) * 100 : 0;
  });
  return brutas.map((_, i) => {
    const vizinhas = brutas.slice(Math.max(0, i - 1), i + 2);
    return vizinhas.reduce((t, v) => t + v, 0) / vizinhas.length;
  });
}

/** Traço da curva dividido em trechos curtos, cada um com a cor da inclinação (azul na descida, verde no plano, amarelo a vermelho na subida). */
function tracoPorInclinacao(amostra, pontos, yMin, yMax) {
  const graus = inclinacoes(amostra);
  return curvasSuaves(pontos, yMin, yMax).map((c, i) => svg('path', { d: trechoDaCurva(c), class: `traj-inclinacao ${classeDaInclinacao(graus[i])}`, fill: 'none' }));
}

/** Degradê da área sob a curva, na cor de destaque do tema. */
function degrade(id, opacidadeTopo = 0.42) {
  return svg('defs', {}, svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    svg('stop', { offset: '0%', style: `stop-color: var(--primary); stop-opacity: ${opacidadeTopo}` }),
    svg('stop', { offset: '100%', style: 'stop-color: var(--primary); stop-opacity: 0.02' }),
  ));
}

/**
 * Perfil de elevação do trajeto.
 * - `cor: 'terreno'`: curva suave com degradê e, embaixo, uma faixa fina que mostra onde são as subidas, os planos e as descidas.
 * - `cor: 'zona'`: cada trecho pintado pela zona do treino (as mesmas cores do perfil do treino).
 * @param {{ perfil: { dM: number[], alt: number[] }, segmentos: Array<{ id: string, iniM: number, fimM: number, tipo: string, zona?: string, papel?: string }>,
 *   cor?: 'zona'|'terreno', altura?: number }} p
 */
export function perfilDoTerreno({ perfil, segmentos, cor = 'zona', altura = 190 }) {
  const A = altura;
  const total = perfil.dM[perfil.dM.length - 1] || 1;
  const minAlt = Math.min(...perfil.alt);
  const maxAlt = Math.max(...perfil.alt);
  const folga = Math.max(5, (maxAlt - minAlt) * 0.14);
  const yMin = minAlt - folga;
  const yMax = maxAlt + folga;
  const x = (d) => MARGEM.esquerda + (d / total) * (L - MARGEM.esquerda - MARGEM.direita);
  const y = (a) => MARGEM.topo + (1 - (a - yMin) / (yMax - yMin)) * (A - MARGEM.topo - MARGEM.base);
  const base = A - MARGEM.base;

  const raiz = svg('svg', {
    viewBox: `0 0 ${L} ${A}`,
    class: 'traj-terreno',
    role: 'img',
    'aria-label': `Perfil de elevação do trajeto, de ${Math.round(minAlt)} a ${Math.round(maxAlt)} metros, com ${segmentos.length} trechos coloridos ${cor === 'zona' ? 'pela zona do treino' : 'por subida, plano e descida'}.`,
  });

  // grade nos extremos da altitude, para dar escala
  for (const a of [minAlt, maxAlt]) raiz.append(svg('line', { x1: MARGEM.esquerda, y1: y(a), x2: L - MARGEM.direita, y2: y(a), class: 'traj-terreno-grade' }));

  if (cor === 'terreno') {
    const id = `traj-grad-${++contador}`;
    raiz.append(degrade(id));
    const amostra = reduzir(perfil.dM.map((d, i) => ({ d, a: perfil.alt[i] })), 70);
    const pontos = amostra.map((p) => [x(p.d), y(p.a)]);
    const curva = caminhoSuave(pontos, y(maxAlt), y(minAlt));
    raiz.append(svg('path', { d: `${curva} L${x(total).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`, fill: `url(#${id})`, stroke: 'none' }));
    raiz.append(...tracoPorInclinacao(amostra, pontos, y(maxAlt), y(minAlt)));
    // ponto mais alto da curva
    const pico = pontos.reduce((m, p) => (p[1] < m[1] ? p : m), pontos[0]);
    raiz.append(svg('circle', { cx: n1(pico[0]), cy: n1(pico[1]), r: 4, class: 'traj-terreno-pico' }));
    // faixa de terreno sob o eixo
    for (const s of segmentos) {
      raiz.append(svg('rect', { x: x(s.iniM).toFixed(1), y: base + 5, width: Math.max(1, x(s.fimM) - x(s.iniM) - 1).toFixed(1), height: 5, rx: 2.5, class: `traj-inclinacao-faixa ${classeDaInclinacao(s.gradienteMedio)}` }, svg('title', {}, `${ROTULOS_DO_TERRENO[s.tipo]}: ${descreverSegmento(s)}`)));
    }
  } else {
    for (const s of segmentos) {
      const pontos = perfil.dM.map((d, i) => [d, perfil.alt[i]]).filter(([d]) => d >= s.iniM && d <= s.fimM);
      if (pontos.length === 0) continue;
      // fecha as bordas do trecho na altitude interpolada, para os trechos se encostarem sem buraco
      const caminho = [[s.iniM, pontos[0][1]], ...pontos, [s.fimM, pontos[pontos.length - 1][1]]];
      const topo = caminho.map(([d, a], i) => `${i === 0 ? 'M' : 'L'}${x(d).toFixed(1)},${y(a).toFixed(1)}`).join(' ');
      const classe = s.zona ? `perfil-${s.zona.toLowerCase()}` : `terreno-${s.tipo}`;
      const dica = s.zona ? `${descreverSegmento(s)}: ${s.zona}, ${s.papel === 'principal' ? 'esforço' : 'recuperação'}` : descreverSegmento(s);
      raiz.append(svg('path', { d: `${topo} L${x(s.fimM).toFixed(1)},${base} L${x(s.iniM).toFixed(1)},${base} Z`, class: `${classe} traj-terreno-area` }, svg('title', {}, dica)));
      raiz.append(svg('path', { d: topo, class: 'traj-terreno-linha', fill: 'none' }));
    }
  }

  // eixos: altitude (mínima e máxima) e distância (início e fim)
  raiz.append(svg('line', { x1: MARGEM.esquerda, y1: base, x2: L - MARGEM.direita, y2: base, class: 'traj-terreno-eixo' }));
  const texto = (conteudo, tx, ty, ancora) => svg('text', { x: tx, y: ty, 'text-anchor': ancora, class: 'traj-terreno-rotulo' }, conteudo);
  raiz.append(texto(`${Math.round(maxAlt)} m`, MARGEM.esquerda - 6, y(maxAlt) + 4, 'end'));
  raiz.append(texto(`${Math.round(minAlt)} m`, MARGEM.esquerda - 6, y(minAlt) + 4, 'end'));
  raiz.append(texto('0', MARGEM.esquerda, A - 4, 'start'));
  raiz.append(texto(total >= 1000 ? `${(total / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(total)} m`, L - MARGEM.direita, A - 4, 'end'));
  return raiz;
}

/**
 * Miniatura do perfil para o cartão do trajeto: só a curva suave com o degradê, sem eixos nem rótulos. Estica na largura.
 * A faixa de subida, plano e descida é desenhada à parte (`faixaDoTerreno`), em HTML.
 */
export function miniPerfilDoTerreno({ perfil, altura = 64 }) {
  const larg = 300;
  const total = perfil.dM[perfil.dM.length - 1] || 1;
  const minAlt = Math.min(...perfil.alt);
  const maxAlt = Math.max(...perfil.alt);
  const faixa = Math.max(10, maxAlt - minAlt);
  const topoY = 8;
  const x = (d) => (d / total) * larg;
  const y = (a) => topoY + (1 - (a - minAlt) / faixa) * (altura - topoY - 2);
  const id = `traj-grad-${++contador}`;
  const raiz = svg('svg', {
    viewBox: `0 0 ${larg} ${altura}`,
    preserveAspectRatio: 'none',
    class: 'traj-mini-altimetria',
    role: 'img',
    'aria-label': `Altimetria do trajeto: de ${Math.round(minAlt)} a ${Math.round(maxAlt)} metros.`,
  });
  raiz.append(degrade(id, 0.4));
  const amostra = reduzir(perfil.dM.map((d, i) => ({ d, a: perfil.alt[i] })), 60);
  const pontos = amostra.map((p) => [x(p.d), y(p.a)]);
  const curva = caminhoSuave(pontos, y(maxAlt), y(minAlt));
  raiz.append(svg('path', { d: `${curva} L${larg},${altura} L0,${altura} Z`, fill: `url(#${id})`, stroke: 'none' }));
  for (const trecho of tracoPorInclinacao(amostra, pontos, y(maxAlt), y(minAlt))) {
    trecho.classList.add('traj-mini-curva');
    trecho.setAttribute('vector-effect', 'non-scaling-stroke');
    raiz.append(trecho);
  }
  return raiz;
}
