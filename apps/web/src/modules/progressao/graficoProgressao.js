import { h } from '../../utils/dom.js';
import { passoDoEixo } from '../../utils/graficoLinha.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTURA = 380;
const MARGEM = { topo: 14, direita: 16, base: 30, esquerda: 54 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/**
 * Gráfico da progressão: uma linha por período (degraus, no caso dos acumulados), a linha da meta tracejada, a projeção até
 * o fim do período pontilhada e um ponto no dia de corte de cada período. Passar o mouse mostra o valor de cada período
 * naquele dia.
 *
 * @param {object} p
 * @param {Array<{ rotulo: string, valores: Array<number|null>, indice: number }>} p.series `indice` escolhe a cor (0 = período em foco)
 * @param {number} p.total quantidade de dias do período em foco (eixo X)
 * @param {Array<{ n: number, rotulo: string }>} p.marcadores marcas do eixo X (meses, dias do mês ou dias da semana)
 * @param {(n: number) => string} p.rotuloDoPonto texto do dia `n` (1 = primeiro dia) no tooltip
 * @param {boolean} p.acumulado desenha em degraus
 * @param {{ valorAlvo: number, esperado: (n: number) => number }|null} p.meta
 * @param {{ n0: number, v0: number, n1: number, v1: number }|null} p.projecao
 * @param {number} p.corte dia de corte do período em foco
 * @param {(v: number) => string} p.formatar valor com unidade (tooltip)
 * @param {(v: number) => string} [p.formatarEixo] valor sem unidade (eixo Y)
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function graficoProgressao({ series, total, marcadores, rotuloDoPonto, acumulado, meta, projecao, corte, formatar, formatarEixo = formatar }) {
  const palco = h('div', { class: 'gp-palco' });
  const el = h('div', { class: 'gp' }, palco);

  const todos = series.flatMap((s) => s.valores.filter((v) => Number.isFinite(v)));
  const maximo = Math.max(1, ...todos, meta?.valorAlvo ?? 0, projecao?.v1 ?? 0);
  const passoY = passoDoEixo(maximo, 5);
  const yMax = Math.ceil(maximo / passoY) * passoY;

  function desenhar() {
    const largura = Math.max(300, palco.clientWidth || 640);
    const lp = largura - MARGEM.esquerda - MARGEM.direita;
    const ap = ALTURA - MARGEM.topo - MARGEM.base;
    const px = (n) => MARGEM.esquerda + (total > 1 ? ((n - 1) / (total - 1)) * lp : lp / 2);
    const py = (v) => MARGEM.topo + (1 - v / yMax) * ap;

    const raiz = svg('svg', { width: largura, height: ALTURA, viewBox: `0 0 ${largura} ${ALTURA}`, role: 'img', 'aria-label': 'Progressão, comparada com períodos anteriores e com a meta' });

    for (let v = 0; v <= yMax + 1e-9; v += passoY) {
      raiz.append(
        svg('line', { x1: MARGEM.esquerda, x2: largura - MARGEM.direita, y1: py(v), y2: py(v), class: 'gp-grade' }),
        svg('text', { x: MARGEM.esquerda - 8, y: py(v) + 4, 'text-anchor': 'end', class: 'gp-rotulo' }, formatarEixo(v)),
      );
    }
    for (const { n, rotulo } of marcadores) {
      raiz.append(
        svg('line', { x1: px(n), x2: px(n), y1: MARGEM.topo, y2: MARGEM.topo + ap, class: 'gp-grade-v' }),
        svg('text', { x: px(n) + (total <= 7 ? 0 : 4), y: ALTURA - 10, 'text-anchor': total <= 7 ? 'middle' : 'start', class: 'gp-rotulo' }, rotulo),
      );
    }

    // meta: linha reta tracejada do ponto de partida até o alvo no último dia
    if (meta) {
      raiz.append(
        svg('line', { x1: px(1), y1: py(meta.esperado(0)), x2: px(total), y2: py(meta.valorAlvo), class: 'gp-meta' }),
        svg('text', { x: largura - MARGEM.direita - 4, y: py(meta.valorAlvo) - 6, 'text-anchor': 'end', class: 'gp-meta-rotulo' }, `Meta ${formatar(meta.valorAlvo)}`),
      );
    }

    // períodos mais antigos primeiro, para o período em foco ficar por cima
    for (const s of [...series].sort((a, b) => b.indice - a.indice)) {
      const g = svg('g', { class: `gp-serie gp-ano-${s.indice % 5}` });
      let d = '';
      let anterior = null;
      s.valores.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = px(i + 1).toFixed(1);
        const y = py(v).toFixed(1);
        if (anterior === null) d += `M${x},${y}`;
        else d += acumulado ? `H${x}V${y}` : `L${x},${y}`;
        anterior = v;
      });
      if (d) g.append(svg('path', { d, class: 'gp-linha' }));
      const nCorte = Math.min(corte, s.valores.length);
      const vCorte = s.valores[nCorte - 1];
      if (Number.isFinite(vCorte)) g.append(svg('circle', { cx: px(nCorte), cy: py(vCorte), r: 4.5, class: 'gp-ponto' }));
      raiz.append(g);
    }

    // projeção pontilhada do ritmo atual até o fim do período
    if (projecao) {
      raiz.append(
        svg('line', { x1: px(projecao.n0), y1: py(projecao.v0), x2: px(projecao.n1), y2: py(projecao.v1), class: 'gp-projecao' }),
        svg('circle', { cx: px(projecao.n1), cy: py(projecao.v1), r: 4, class: 'gp-projecao-ponto' }),
      );
    }

    // cursor e tooltip
    const guia = svg('line', { y1: MARGEM.topo, y2: MARGEM.topo + ap, class: 'gp-guia', visibility: 'hidden' });
    const dica = h('div', { class: 'gp-dica', hidden: true });
    raiz.append(guia);
    const area = svg('rect', { x: MARGEM.esquerda, y: MARGEM.topo, width: lp, height: ap, class: 'gp-captura' });
    area.addEventListener('pointermove', (e) => {
      const caixa = raiz.getBoundingClientRect();
      const xSvg = ((e.clientX - caixa.left) / (caixa.width || 1)) * largura;
      const n = total > 1 ? Math.min(total, Math.max(1, Math.round(((xSvg - MARGEM.esquerda) / lp) * (total - 1)) + 1)) : 1;
      guia.setAttribute('x1', px(n));
      guia.setAttribute('x2', px(n));
      guia.setAttribute('visibility', 'visible');
      const linhas = [h('strong', { class: 'gp-dica-x' }, rotuloDoPonto(n))];
      for (const s of [...series].sort((a, b) => a.indice - b.indice)) {
        const v = s.valores[Math.min(n, s.valores.length) - 1];
        linhas.push(h('div', { class: `gp-dica-linha gp-ano-${s.indice % 5}` }, h('i', { class: 'gp-dica-ponto' }), h('span', null, s.rotulo), h('b', null, Number.isFinite(v) ? formatar(v) : '—')));
      }
      if (meta) linhas.push(h('div', { class: 'gp-dica-linha gp-dica-meta' }, h('i', { class: 'gp-dica-ponto' }), h('span', null, 'Meta'), h('b', null, formatar(meta.esperado(n)))));
      dica.replaceChildren(...linhas);
      dica.hidden = false;
      const naDireita = px(n) > largura / 2;
      dica.style.left = naDireita ? 'auto' : `${px(n) + 14}px`;
      dica.style.right = naDireita ? `${largura - px(n) + 14}px` : 'auto';
    });
    area.addEventListener('pointerleave', () => {
      guia.setAttribute('visibility', 'hidden');
      dica.hidden = true;
    });
    raiz.append(area);
    palco.replaceChildren(raiz, dica);
  }

  let observador = null;
  if (typeof ResizeObserver === 'function') {
    let anterior = 0;
    observador = new ResizeObserver(() => {
      const w = palco.clientWidth;
      if (w > 0 && w !== anterior) {
        anterior = w;
        desenhar();
      }
    });
    observador.observe(palco);
  } else {
    queueMicrotask(desenhar);
  }
  return { el, destruir: () => observador?.disconnect() };
}
