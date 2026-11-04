import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTURA = 300;
const MARGEM = { topo: 24, base: 28, lateral: 8 };
const LARGURA_EIXO = 46;
const DIVISOES = 4;

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/** Passos "redondos" em ordem crescente (1, 2, 2,5, 5 × 10^n). */
function passosGenericos() {
  const lista = [];
  for (let p = -1; p <= 6; p++) for (const m of [1, 2, 2.5, 5]) lista.push(m * 10 ** p);
  return lista;
}

/**
 * Escala com exatamente `DIVISOES` intervalos e passo redondo, para que as linhas de grade de todas as séries (cada uma com
 * seu eixo) caiam no mesmo lugar.
 */
export function escalaDaSerie(valores, passosPreferidos) {
  const finitos = valores.filter((v) => Number.isFinite(v));
  if (finitos.length === 0) return { min: 0, max: DIVISOES, passo: 1 };
  const vmin = Math.min(...finitos);
  const vmax = Math.max(...finitos);
  const candidatos = [...(passosPreferidos ?? []), ...passosGenericos()].sort((a, b) => a - b);
  for (const passo of candidatos) {
    const min = Math.floor(vmin / passo) * passo;
    if (min + DIVISOES * passo >= vmax) return { min, max: min + DIVISOES * passo, passo };
  }
  return { min: vmin, max: vmax || vmin + 1, passo: ((vmax - vmin) || 1) / DIVISOES };
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

/**
 * Gráfico de atividade em SVG: várias séries sobrepostas (elevação em área, FC, velocidade ou ritmo), cada uma com seu eixo
 * colorido, linhas de grade alinhadas, cursor com tooltip e botões para ligar/desligar cada série. As cores vêm de variáveis
 * CSS, então acompanham o tema claro e o escuro.
 *
 * @param {object} p
 * @param {number[]} p.x eixo horizontal (distância em km ou tempo em s), crescente
 * @param {(i: number) => string} p.rotuloX texto do ponto `i` no tooltip
 * @param {(v: number) => string} p.formatarEixoX rótulo dos marcadores do eixo X
 * @param {Array<{ id: string, rotulo: string, unidade: string, valores: Array<number|null>, lado: 'e'|'d', area?: boolean,
 *   inverter?: boolean, passos?: number[], formatar: (v: number) => string }>} p.series
 * @param {(i: number|null) => void} [p.aoPassar] chamado com o índice sob o cursor (null ao sair)
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function graficoAtividade({ x: xBruto, rotuloX, formatarEixoX, series, aoPassar }) {
  const x = eixoXValido(xBruto);
  const ativas = new Set(series.map((s) => s.id));
  const escalas = new Map(series.map((s) => [s.id, escalaDaSerie(s.valores, s.passos)]));

  const palco = h('div', { class: 'ga-palco' });
  const chips = h(
    'div',
    { class: 'ga-chips', role: 'group', 'aria-label': 'Séries do gráfico' },
    series.map((s) => {
      const botao = h('button', { class: `ga-chip ga-c-${s.id}`, type: 'button', 'aria-pressed': 'true' }, h('span', { class: 'ga-chip-ponto' }), s.rotulo);
      botao.addEventListener('click', () => {
        if (ativas.has(s.id)) {
          if (ativas.size === 1) return; // sempre fica uma série visível
          ativas.delete(s.id);
        } else {
          ativas.add(s.id);
        }
        botao.setAttribute('aria-pressed', String(ativas.has(s.id)));
        desenhar();
      });
      return botao;
    }),
  );
  const el = h('div', { class: 'ga' }, chips, palco);

  function desenhar() {
    const largura = Math.max(280, palco.clientWidth || 600);
    const visiveis = series.filter((s) => ativas.has(s.id));
    const esquerda = visiveis.filter((s) => s.lado === 'e');
    const direita = visiveis.filter((s) => s.lado === 'd');
    const ml = MARGEM.lateral + esquerda.length * LARGURA_EIXO;
    const mr = MARGEM.lateral + direita.length * LARGURA_EIXO;
    const lp = Math.max(60, largura - ml - mr);
    const ap = ALTURA - MARGEM.topo - MARGEM.base;
    const x0 = x[0];
    const x1 = x[x.length - 1];
    const px = (i) => ml + ((x[i] - x0) / (x1 - x0 || 1)) * lp;
    const py = (s, v) => {
      const { min, max } = escalas.get(s.id);
      const f = (v - min) / (max - min || 1);
      return MARGEM.topo + (s.inverter ? f : 1 - f) * ap;
    };

    const raiz = svg('svg', { width: largura, height: ALTURA, viewBox: `0 0 ${largura} ${ALTURA}`, role: 'img', 'aria-label': 'Gráfico da atividade: elevação, frequência cardíaca e velocidade ao longo do percurso' });

    for (let k = 0; k <= DIVISOES; k++) {
      const y = MARGEM.topo + (k / DIVISOES) * ap;
      raiz.append(svg('line', { x1: ml, x2: ml + lp, y1: y, y2: y, class: 'ga-grade' }));
    }
    const passoX = passoDoEixoX(x1 - x0, Math.max(3, Math.floor(lp / 90)));
    for (let v = Math.ceil(x0 / passoX) * passoX; v <= x1 + 1e-9; v += passoX) {
      const xi = ml + ((v - x0) / (x1 - x0 || 1)) * lp;
      raiz.append(svg('text', { x: xi, y: ALTURA - 8, 'text-anchor': 'middle', class: 'ga-rotulo' }, formatarEixoX(v)));
    }

    // elevação (área) primeiro, para ficar atrás das linhas
    const ordem = [...visiveis.filter((s) => s.area), ...visiveis.filter((s) => !s.area)];
    for (const s of ordem) {
      const g = svg('g', { class: `ga-serie ga-c-${s.id}` });
      let d = '';
      let aberto = false;
      let primeiro = null;
      let ultimo = null;
      s.valores.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          aberto = false;
          return;
        }
        const xi = px(i).toFixed(1);
        d += `${aberto ? 'L' : 'M'}${xi},${py(s, v).toFixed(1)}`;
        aberto = true;
        if (primeiro === null) primeiro = xi;
        ultimo = xi;
      });
      if (s.area && primeiro !== null) {
        const base = (MARGEM.topo + ap).toFixed(1);
        g.append(svg('path', { d: `${d}L${ultimo},${base}L${primeiro},${base}Z`, class: 'ga-area' }));
      }
      g.append(svg('path', { d, class: 'ga-linha' }));
      raiz.append(g);
    }

    // eixos, um por série visível, com a unidade no topo
    const desenharEixos = (lista, lado) =>
      lista.forEach((s, k) => {
        const { min, passo } = escalas.get(s.id);
        const xe = lado === 'e' ? ml - 6 - k * LARGURA_EIXO : ml + lp + 6 + k * LARGURA_EIXO;
        const ancora = lado === 'e' ? 'end' : 'start';
        const g = svg('g', { class: `ga-eixo ga-c-${s.id}` }, svg('text', { x: xe, y: 12, 'text-anchor': ancora, class: 'ga-unidade' }, s.unidade));
        for (let k2 = 0; k2 <= DIVISOES; k2++) {
          g.append(svg('text', { x: xe, y: py(s, min + k2 * passo) + 4, 'text-anchor': ancora, class: 'ga-rotulo' }, s.formatar(min + k2 * passo)));
        }
        raiz.append(g);
      });
    desenharEixos(esquerda, 'e');
    desenharEixos(direita, 'd');

    // cursor
    const guia = svg('line', { y1: MARGEM.topo, y2: MARGEM.topo + ap, class: 'ga-guia', visibility: 'hidden' });
    const pontos = visiveis.map((s) => svg('circle', { r: 4, class: `ga-ponto ga-c-${s.id}`, visibility: 'hidden' }));
    const dica = h('div', { class: 'ga-dica', hidden: true });
    raiz.append(guia, ...pontos);

    const sair = () => {
      guia.setAttribute('visibility', 'hidden');
      pontos.forEach((p) => p.setAttribute('visibility', 'hidden'));
      dica.hidden = true;
      aoPassar?.(null);
    };
    const area = svg('rect', { x: ml, y: MARGEM.topo, width: lp, height: ap, class: 'ga-captura' });
    area.addEventListener('pointermove', (e) => {
      const caixa = raiz.getBoundingClientRect();
      const alvo = x0 + (((e.clientX - caixa.left) * (largura / caixa.width) - ml) / lp) * (x1 - x0);
      const i = indiceMaisProximo(x, alvo);
      const xi = px(i);
      guia.setAttribute('x1', xi);
      guia.setAttribute('x2', xi);
      guia.setAttribute('visibility', 'visible');
      const linhas = [h('strong', { class: 'ga-dica-x' }, rotuloX(i))];
      visiveis.forEach((s, k) => {
        const v = s.valores[i];
        const ok = Number.isFinite(v);
        if (ok) {
          pontos[k].setAttribute('cx', xi);
          pontos[k].setAttribute('cy', py(s, v));
        }
        pontos[k].setAttribute('visibility', ok ? 'visible' : 'hidden');
        linhas.push(
          h('div', { class: `ga-dica-linha ga-c-${s.id}` }, h('span', { class: 'ga-chip-ponto' }), h('span', null, s.rotulo), h('b', null, ok ? `${s.formatar(v)} ${s.unidade}` : '—')),
        );
      });
      dica.replaceChildren(...linhas);
      dica.hidden = false;
      const naDireita = xi > largura / 2;
      dica.style.left = naDireita ? 'auto' : `${xi + 14}px`;
      dica.style.right = naDireita ? `${largura - xi + 14}px` : 'auto';
      aoPassar?.(i);
    });
    area.addEventListener('pointerleave', sair);
    area.addEventListener('pointercancel', sair);
    raiz.append(area);

    palco.replaceChildren(raiz, dica);
  }

  let observador = null;
  if (typeof ResizeObserver === 'function') {
    let larguraAnterior = 0;
    observador = new ResizeObserver(() => {
      const w = palco.clientWidth;
      if (w > 0 && w !== larguraAnterior) {
        larguraAnterior = w;
        desenhar();
      }
    });
    observador.observe(palco);
  } else {
    queueMicrotask(desenhar);
  }

  return { el, destruir: () => observador?.disconnect() };
}

/** Passo redondo para os marcadores do eixo X (km ou min), com no máximo `alvo` marcadores. */
function passoDoEixoX(intervalo, alvo) {
  const bruto = intervalo / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto || 1));
  for (const m of [1, 2, 5, 10]) if (m * potencia >= bruto) return m * potencia;
  return potencia * 10;
}
