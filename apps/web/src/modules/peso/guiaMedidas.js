import { MEDIDAS } from '@no-strova/domain';
import { h } from '../../utils/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/**
 * Corpo de frente (a pessoa fica de frente para quem olha, então o lado direito dela é o esquerdo do desenho).
 * Cada segmento é uma "cápsula" desenhada duas vezes: primeiro o contorno, depois o preenchimento, o que funde o corpo
 * numa silhueta só.
 */
const SEGMENTOS = Object.freeze([
  { x1: 60, y1: 34, x2: 60, y2: 46, w: 12 }, // pescoço
  { x1: 24, y1: 56, x2: 19, y2: 88, w: 11 }, // braço direito
  { x1: 19, y1: 88, x2: 15, y2: 120, w: 9 }, // antebraço direito
  { x1: 96, y1: 56, x2: 101, y2: 88, w: 11 }, // braço esquerdo
  { x1: 101, y1: 88, x2: 105, y2: 120, w: 9 }, // antebraço esquerdo
  { x1: 47, y1: 160, x2: 45, y2: 208, w: 21 }, // coxa direita
  { x1: 45, y1: 208, x2: 44, y2: 252, w: 14 }, // panturrilha direita
  { x1: 73, y1: 160, x2: 75, y2: 208, w: 21 }, // coxa esquerda
  { x1: 75, y1: 208, x2: 76, y2: 252, w: 14 }, // panturrilha esquerda
]);
const TRONCO = 'M32 50 Q60 44 88 50 L84 78 Q82 96 80 112 Q80 128 86 142 L88 156 L32 156 L34 142 Q40 128 40 112 Q38 96 36 78 Z';

/** Onde a fita passa em cada medida: altura (y) e extremos (x1 a x2), na escala do desenho (120 × 270). */
const FITAS = Object.freeze({
  pescocoCm: { y: 40, x1: 51, x2: 69 },
  toraxCm: { y: 70, x1: 30, x2: 90 },
  cinturaCm: { y: 112, x1: 36, x2: 84 },
  abdomenCm: { y: 128, x1: 36, x2: 84 },
  quadrilCm: { y: 148, x1: 28, x2: 92 },
  bracoCm: { y: 72, x1: 12, x2: 31 },
  coxaCm: { y: 184, x1: 31, x2: 61 },
  panturrilhaCm: { y: 224, x1: 33, x2: 56 },
});

/** Silhueta de frente com a fita desenhada no ponto da medida (`campo`), no tema atual. */
export function desenhoDaMedida(campo, rotulo) {
  const fita = FITAS[campo];
  const raiz = svg('svg', { viewBox: '0 0 120 270', class: 'medidas-corpo-svg', role: 'img', 'aria-label': `Desenho do corpo com a fita métrica no ponto de medição: ${rotulo}` });
  const contorno = svg('g', { class: 'medidas-corpo-contorno' });
  const preenchido = svg('g', { class: 'medidas-corpo-cheio' });
  contorno.append(svg('circle', { cx: 60, cy: 21, r: 14 }), svg('path', { d: TRONCO, 'stroke-width': 3 }));
  preenchido.append(svg('circle', { cx: 60, cy: 21, r: 13 }), svg('path', { d: TRONCO }));
  for (const s of SEGMENTOS) {
    contorno.append(svg('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, 'stroke-width': s.w + 3, 'stroke-linecap': 'round' }));
    preenchido.append(svg('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, 'stroke-width': s.w, 'stroke-linecap': 'round' }));
  }
  raiz.append(contorno, preenchido);
  if (fita) {
    const meio = (fita.x1 + fita.x2) / 2;
    raiz.append(
      svg('path', { d: `M${fita.x1} ${fita.y} Q${meio} ${fita.y + 6} ${fita.x2} ${fita.y}`, class: 'medidas-fita' }),
      svg('path', { d: `M${fita.x1} ${fita.y} Q${meio} ${fita.y - 6} ${fita.x2} ${fita.y}`, class: 'medidas-fita medidas-fita-fundo' }),
      svg('circle', { cx: fita.x1, cy: fita.y, r: 2.6, class: 'medidas-fita-ponta' }),
      svg('circle', { cx: fita.x2, cy: fita.y, r: 2.6, class: 'medidas-fita-ponta' }),
    );
  }
  return raiz;
}

const ANTES_DE_COMECAR = Object.freeze([
  'Use uma fita métrica flexível, de costura (não use régua nem fita de aço).',
  'Meça pela manhã, em jejum e depois de ir ao banheiro, de preferência sem roupa ou com roupa bem justa.',
  'Fique em pé, relaxado, com o peso igual nas duas pernas. Meça sempre o lado direito.',
  'A fita deve ficar rente à pele e paralela ao chão, sem apertar nem afundar a pele.',
  'Meça duas vezes. Se os valores diferirem mais de 1 cm, meça uma terceira vez e use a média.',
  'Meça sempre nas mesmas condições (mesma hora, mesmo ponto) e a cada 2 a 4 semanas. Variações menores que 1 cm podem ser só erro de medição.',
]);

/** Conteúdo da aba "Como medir": regras gerais e um cartão com desenho para cada medida. */
export function criarGuiaDeMedidas({ aoAbrirRegistro }) {
  return h(
    'div',
    { class: 'medidas-guia' },
    h('div', { class: 'medidas-antes' }, h('h3', { class: 'medidas-subtitulo' }, 'Antes de começar'), h('ul', null, ...ANTES_DE_COMECAR.map((t) => h('li', null, t)))),
    h(
      'div',
      { class: 'medidas-guia-grade' },
      ...MEDIDAS.map((m, i) =>
        h(
          'article',
          { class: 'medidas-guia-cartao', id: `medidas-guia-${m.campo}` },
          h('div', { class: 'medidas-guia-desenho' }, desenhoDaMedida(m.campo, m.rotulo)),
          h('div', { class: 'medidas-guia-texto' }, h('h3', { class: 'medidas-subtitulo' }, `${i + 1}. ${m.rotulo}`), h('p', null, m.ponto), h('p', { class: 'texto-secundario' }, m.dica)),
        ),
      ),
    ),
    h('div', { class: 'medidas-guia-rodape' }, h('button', { class: 'btn', type: 'button', onClick: aoAbrirRegistro }, 'Registrar minhas medidas')),
  );
}
