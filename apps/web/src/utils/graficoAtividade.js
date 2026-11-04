import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTURA_PAINEL = 112;
const ALTURA_EIXO = 26;
const PAD = { topo: 10, base: 8, lateral: 2 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/** Completa lacunas do eixo X (null) com o valor anterior e garante que ele nunca diminui. */
function eixoXValido(x) {
  const saida = [];
  let anterior = 0;
  for (const v of x) {
    anterior = Number.isFinite(v) ? Math.max(anterior, v) : anterior;
    saida.push(anterior);
  }
  return saida;
}

/** Posição (índice) mais próxima de `alvo` num vetor crescente. */
function indiceMaisProximo(x, alvo) {
  let ini = 0;
  let fim = x.length - 1;
  while (fim - ini > 1) {
    const meio = (ini + fim) >> 1;
    if (x[meio] < alvo) ini = meio;
    else fim = meio;
  }
  return Math.abs(x[ini] - alvo) <= Math.abs(x[fim] - alvo) ? ini : fim;
}

/** Passo redondo para os marcadores do eixo X (km ou min), com no máximo `alvo` marcadores. */
function passoDoEixoX(intervalo, alvo) {
  const bruto = intervalo / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto || 1));
  for (const m of [1, 2, 5, 10]) if (m * potencia >= bruto) return m * potencia;
  return potencia * 10;
}

/** Curva suave que não "estoura" entre os pontos (spline cúbica monotônica, Fritsch-Carlson). `pts` = [[x, y], ...]. */
export function caminhoSuave(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push(dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i][0] + dx[i] / 3;
    const y1 = pts[i][1] + (t[i] * dx[i]) / 3;
    const x2 = pts[i + 1][0] - dx[i] / 3;
    const y2 = pts[i + 1][1] - (t[i + 1] * dx[i]) / 3;
    d += `C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function estatisticas(valores) {
  const f = valores.filter((v) => Number.isFinite(v));
  if (f.length === 0) return { media: null, min: null, max: null };
  return { media: f.reduce((a, b) => a + b, 0) / f.length, min: Math.min(...f), max: Math.max(...f) };
}

/**
 * Gráfico de atividade em painéis empilhados (elevação, FC, velocidade ou ritmo), todos com o mesmo eixo X e um cursor único
 * que atravessa os painéis. O valor do ponto aparece no cabeçalho de cada painel (sem caixa flutuante sobre as linhas); sem
 * cursor, o cabeçalho mostra a média. As cores vêm de variáveis CSS, então acompanham o tema claro e o escuro.
 *
 * @param {object} p
 * @param {number[]} p.x eixo horizontal (distância em km ou tempo em min), crescente
 * @param {(i: number) => string} p.rotuloX texto da posição `i`, mostrado no topo enquanto o cursor está no gráfico
 * @param {(v: number) => string} p.formatarEixoX rótulo dos marcadores do eixo X
 * @param {Array<{ id: string, rotulo: string, unidade: string, valores: Array<number|null>, area?: boolean,
 *   inverter?: boolean, formatar: (v: number) => string }>} p.series
 * @param {(i: number|null) => void} [p.aoPassar] chamado com o índice sob o cursor (null ao sair)
 * @param {(sel: { i0: number, i1: number } | null) => void} [p.aoSelecionar] arrastar sobre o gráfico seleciona um trecho;
 *   clicar ou usar "Limpar seleção" remove a seleção (null)
 * @returns {{ el: HTMLElement, destruir: () => void, limparSelecao: () => void }}
 */
export function graficoAtividade({ x: xBruto, rotuloX, formatarEixoX, series, aoPassar, aoSelecionar }) {
  const x = eixoXValido(xBruto);
  const x0 = x[0];
  const x1 = x[x.length - 1];
  const textoPadrao = aoSelecionar ? 'Passe o mouse sobre o gráfico para ver cada ponto · arraste para selecionar um trecho' : 'Passe o mouse (ou o dedo) sobre o gráfico para ver cada ponto';

  const posicao = h('span', { class: 'ga-posicao' }, textoPadrao);
  const limpar = h('button', { class: 'ga-limpar', type: 'button', hidden: true }, 'Limpar seleção');
  const paineisEl = h('div', { class: 'ga-paineis' });
  const eixoSvg = svg('svg', { height: ALTURA_EIXO, 'aria-hidden': 'true' });
  const el = h('div', { class: 'ga' }, h('div', { class: 'ga-cabecalho' }, posicao, limpar), paineisEl, eixoSvg);

  const paineis = series.map((s) => {
    const est = estatisticas(s.valores);
    const media = est.media === null ? '—' : s.formatar(est.media);
    const valorEl = h('strong', { class: 'ga-valor' }, media);
    const extremo = s.inverter ? est.min : est.max;
    const nomeExtremo = s.inverter ? 'melhor' : 'máx';
    const resumo = est.media === null ? '' : `méd ${media} · ${nomeExtremo} ${s.formatar(extremo)}`;
    const svgEl = svg('svg', { class: 'ga-svg', role: 'img', 'aria-label': `${s.rotulo} ao longo do percurso` });
    const raiz = h(
      'section',
      { class: `ga-painel ga-c-${s.id}` },
      h(
        'header',
        { class: 'ga-painel-cab' },
        h('span', { class: 'ga-painel-nome' }, h('i', { class: 'ga-ponto-leg' }), s.rotulo),
        h('span', { class: 'ga-painel-resumo' }, resumo),
        h('span', { class: 'ga-painel-valor' }, valorEl, h('small', null, s.unidade)),
      ),
      svgEl,
    );
    paineisEl.append(raiz);
    return { s, est, svgEl, valorEl, media, guia: null, ponto: null, py: null };
  });

  let largura = 0;
  let selecao = null; // { i0, i1 } confirmada
  let arraste = null; // { inicio, atual, xTela }
  const px = (i) => PAD.lateral + ((x[i] - x0) / (x1 - x0 || 1)) * (largura - 2 * PAD.lateral);

  function desenhar() {
    largura = Math.max(280, paineisEl.clientWidth || 600);
    const ticksX = [];
    const passoX = passoDoEixoX(x1 - x0, Math.max(3, Math.floor(largura / 90)));
    for (let v = Math.ceil(x0 / passoX) * passoX; v <= x1 + 1e-9; v += passoX) {
      ticksX.push({ v, xt: PAD.lateral + ((v - x0) / (x1 - x0 || 1)) * (largura - 2 * PAD.lateral) });
    }

    for (const p of paineis) {
      const { s, est, svgEl } = p;
      svgEl.setAttribute('width', largura);
      svgEl.setAttribute('height', ALTURA_PAINEL);
      svgEl.setAttribute('viewBox', `0 0 ${largura} ${ALTURA_PAINEL}`);
      svgEl.replaceChildren();
      const topo = PAD.topo;
      const base = ALTURA_PAINEL - PAD.base;
      const folga = ((est.max ?? 0) - (est.min ?? 0) || Math.abs(est.max ?? 1) * 0.1 || 1) * 0.12;
      const vmin = (est.min ?? 0) - folga;
      const vmax = (est.max ?? 1) + folga;
      p.py = (v) => {
        const f = (v - vmin) / (vmax - vmin || 1);
        return topo + (s.inverter ? f : 1 - f) * (base - topo);
      };

      // grade: três linhas horizontais e os marcadores verticais do eixo X
      for (const y of [topo, (topo + base) / 2, base]) svgEl.append(svg('line', { x1: 0, x2: largura, y1: y, y2: y, class: 'ga-grade' }));
      for (const { xt } of ticksX) svgEl.append(svg('line', { x1: xt, x2: xt, y1: topo, y2: base, class: 'ga-grade-v' }));

      // segmentos contínuos (a série pode ter lacunas)
      const segmentos = [];
      let atual = [];
      s.valores.forEach((v, i) => {
        if (Number.isFinite(v)) {
          atual.push([px(i), p.py(v)]);
        } else if (atual.length) {
          segmentos.push(atual);
          atual = [];
        }
      });
      if (atual.length) segmentos.push(atual);

      svgEl.append(
        svg(
          'defs',
          {},
          svg('linearGradient', { id: `ga-g-${s.id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('stop', { offset: '0%', class: 'ga-grad-topo' }), svg('stop', { offset: '100%', class: 'ga-grad-base' })),
        ),
      );
      for (const seg of segmentos) {
        const d = caminhoSuave(seg);
        const ultimo = seg[seg.length - 1][0].toFixed(1);
        const primeiro = seg[0][0].toFixed(1);
        svgEl.append(svg('path', { d: `${d}L${ultimo},${base}L${primeiro},${base}Z`, class: 'ga-area', fill: `url(#ga-g-${s.id})` }));
        svgEl.append(svg('path', { d, class: 'ga-linha' }));
      }

      // escala (mínimo e máximo), discreta, sobre a grade
      if (est.min !== null) {
        const alto = s.inverter ? est.min : est.max;
        const baixo = s.inverter ? est.max : est.min;
        svgEl.append(svg('text', { x: 4, y: topo - 1, class: 'ga-escala' }, s.formatar(alto)), svg('text', { x: 4, y: base - 3, class: 'ga-escala' }, s.formatar(baixo)));
      }

      p.faixa = svg('rect', { y: 0, height: ALTURA_PAINEL, class: 'ga-selecao', visibility: 'hidden' });
      svgEl.append(p.faixa);
      p.guia = svg('line', { y1: 0, y2: ALTURA_PAINEL, class: 'ga-guia', visibility: 'hidden' });
      p.ponto = svg('circle', { r: 4, class: 'ga-ponto', visibility: 'hidden' });
      svgEl.append(p.guia, p.ponto);
    }

    eixoSvg.setAttribute('width', largura);
    eixoSvg.setAttribute('viewBox', `0 0 ${largura} ${ALTURA_EIXO}`);
    eixoSvg.replaceChildren();
    for (const { v, xt } of ticksX) {
      eixoSvg.append(svg('text', { x: Math.min(largura - 16, Math.max(16, xt)), y: 17, 'text-anchor': 'middle', class: 'ga-rotulo' }, formatarEixoX(v)));
    }
    pintarSelecao(arraste ? { i0: Math.min(arraste.inicio, arraste.atual), i1: Math.max(arraste.inicio, arraste.atual) } : selecao);
  }

  /** Mostra (ou esconde) a faixa de seleção em todos os painéis. */
  function pintarSelecao(sel) {
    for (const p of paineis) {
      if (!p.faixa) continue;
      if (!sel) {
        p.faixa.setAttribute('visibility', 'hidden');
        continue;
      }
      const a = px(sel.i0);
      p.faixa.setAttribute('x', a);
      p.faixa.setAttribute('width', Math.max(1, px(sel.i1) - a));
      p.faixa.setAttribute('visibility', 'visible');
    }
    limpar.hidden = !selecao;
    el.classList.toggle('ga-com-selecao', !!selecao);
  }

  function indiceDoPonteiro(e) {
    const caixa = paineisEl.getBoundingClientRect();
    const xSvg = ((e.clientX - caixa.left) / caixa.width) * largura;
    const alvo = x0 + ((xSvg - PAD.lateral) / (largura - 2 * PAD.lateral)) * (x1 - x0);
    return indiceMaisProximo(x, Math.min(x1, Math.max(x0, alvo)));
  }

  function limparSelecao() {
    selecao = null;
    arraste = null;
    pintarSelecao(null);
    aoSelecionar?.(null);
  }
  limpar.addEventListener('click', limparSelecao);

  function sair() {
    for (const p of paineis) {
      p.guia?.setAttribute('visibility', 'hidden');
      p.ponto?.setAttribute('visibility', 'hidden');
      p.valorEl.textContent = p.media;
    }
    posicao.textContent = textoPadrao;
    el.classList.remove('ga-ativo');
    aoPassar?.(null);
  }

  paineisEl.addEventListener('pointermove', (e) => {
    if (paineisEl.getBoundingClientRect().width === 0 || largura === 0) return;
    const i = indiceDoPonteiro(e);
    if (arraste) {
      arraste.atual = i;
      pintarSelecao({ i0: Math.min(arraste.inicio, i), i1: Math.max(arraste.inicio, i) });
    }
    const xi = px(i);
    for (const p of paineis) {
      const v = p.s.valores[i];
      const ok = Number.isFinite(v);
      p.guia.setAttribute('x1', xi);
      p.guia.setAttribute('x2', xi);
      p.guia.setAttribute('visibility', 'visible');
      if (ok) {
        p.ponto.setAttribute('cx', xi);
        p.ponto.setAttribute('cy', p.py(v));
      }
      p.ponto.setAttribute('visibility', ok ? 'visible' : 'hidden');
      p.valorEl.textContent = ok ? p.s.formatar(v) : '—';
    }
    posicao.textContent = rotuloX(i);
    el.classList.add('ga-ativo');
    aoPassar?.(i);
  });
  paineisEl.addEventListener('pointerdown', (e) => {
    if (!aoSelecionar || (e.button !== undefined && e.button !== 0)) return;
    const i = indiceDoPonteiro(e);
    arraste = { inicio: i, atual: i, xTela: e.clientX };
    paineisEl.setPointerCapture?.(e.pointerId);
  });
  const terminar = (e) => {
    if (!arraste) return;
    const { inicio, atual, xTela } = arraste;
    arraste = null;
    paineisEl.releasePointerCapture?.(e.pointerId);
    const i0 = Math.min(inicio, atual);
    const i1 = Math.max(inicio, atual);
    if (Math.abs(e.clientX - xTela) < 6 || i1 - i0 < 2) {
      // um clique simples limpa a seleção
      if (selecao) limparSelecao();
      else pintarSelecao(null);
      return;
    }
    selecao = { i0, i1 };
    pintarSelecao(selecao);
    aoSelecionar?.(selecao);
  };
  paineisEl.addEventListener('pointerup', terminar);
  paineisEl.addEventListener('pointerleave', (e) => {
    if (!arraste) sair();
    else if (e.buttons === 0) terminar(e);
  });
  paineisEl.addEventListener('pointercancel', () => {
    arraste = null;
    pintarSelecao(selecao);
    sair();
  });

  let observador = null;
  if (typeof ResizeObserver === 'function') {
    let larguraAnterior = 0;
    observador = new ResizeObserver(() => {
      const w = paineisEl.clientWidth;
      if (w > 0 && w !== larguraAnterior) {
        larguraAnterior = w;
        desenhar();
      }
    });
    observador.observe(paineisEl);
  } else {
    queueMicrotask(desenhar);
  }

  return { el, destruir: () => observador?.disconnect(), limparSelecao };
}
