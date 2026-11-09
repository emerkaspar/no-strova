import { descreverSegmento } from '@no-strova/domain';

const NS = 'http://www.w3.org/2000/svg';
const L = 640;
const A = 190;
const MARGEM = { topo: 12, direita: 10, base: 24, esquerda: 44 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/**
 * Perfil de elevação do trajeto, com cada trecho pintado pela zona escolhida para ele (as mesmas cores do perfil do treino).
 * @param {{ perfil: { dM: number[], alt: number[] }, segmentos: Array<{ id: string, iniM: number, fimM: number, zona: string, papel: string, tipo: string }> }} p
 */
export function perfilDoTerreno({ perfil, segmentos }) {
  const total = perfil.dM[perfil.dM.length - 1] || 1;
  const minAlt = Math.min(...perfil.alt);
  const maxAlt = Math.max(...perfil.alt);
  const folga = Math.max(5, (maxAlt - minAlt) * 0.12);
  const yMin = minAlt - folga;
  const yMax = maxAlt + folga;
  const x = (d) => MARGEM.esquerda + (d / total) * (L - MARGEM.esquerda - MARGEM.direita);
  const y = (a) => MARGEM.topo + (1 - (a - yMin) / (yMax - yMin)) * (A - MARGEM.topo - MARGEM.base);
  const base = A - MARGEM.base;

  const raiz = svg('svg', {
    viewBox: `0 0 ${L} ${A}`,
    class: 'traj-terreno',
    role: 'img',
    'aria-label': `Perfil de elevação do trajeto, de ${Math.round(minAlt)} a ${Math.round(maxAlt)} metros, com ${segmentos.length} trechos coloridos pela zona do treino.`,
  });

  for (const s of segmentos) {
    const pontos = perfil.dM.map((d, i) => [d, perfil.alt[i]]).filter(([d]) => d >= s.iniM && d <= s.fimM);
    if (pontos.length === 0) continue;
    // fecha as bordas do trecho na altitude interpolada, para os trechos se encostarem sem buraco
    const primeiro = pontos[0];
    const ultimo = pontos[pontos.length - 1];
    const caminho = [[s.iniM, primeiro[1]], ...pontos, [s.fimM, ultimo[1]]];
    const topo = caminho.map(([d, a], i) => `${i === 0 ? 'M' : 'L'}${x(d).toFixed(1)},${y(a).toFixed(1)}`).join(' ');
    const area = svg('path', { d: `${topo} L${x(s.fimM).toFixed(1)},${base} L${x(s.iniM).toFixed(1)},${base} Z`, class: `perfil-${s.zona.toLowerCase()} traj-terreno-area` }, svg('title', {}, `${descreverSegmento(s)}: ${s.zona}, ${s.papel === 'principal' ? 'esforço' : 'recuperação'}`));
    raiz.append(area);
    raiz.append(svg('path', { d: topo, class: 'traj-terreno-linha', fill: 'none' }));
  }

  // eixos: altitude (mínima e máxima) e distância (início e fim)
  raiz.append(svg('line', { x1: MARGEM.esquerda, y1: base, x2: L - MARGEM.direita, y2: base, class: 'traj-terreno-eixo' }));
  const texto = (conteudo, tx, ty, ancora) => svg('text', { x: tx, y: ty, 'text-anchor': ancora, class: 'traj-terreno-rotulo' }, conteudo);
  raiz.append(texto(`${Math.round(maxAlt)} m`, MARGEM.esquerda - 6, y(maxAlt) + 4, 'end'));
  raiz.append(texto(`${Math.round(minAlt)} m`, MARGEM.esquerda - 6, y(minAlt) + 4, 'end'));
  raiz.append(texto('0', MARGEM.esquerda, A - 6, 'start'));
  raiz.append(texto(total >= 1000 ? `${(total / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(total)} m`, L - MARGEM.direita, A - 6, 'end'));
  return raiz;
}
