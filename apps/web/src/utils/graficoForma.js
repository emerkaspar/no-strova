import { FAIXAS_FORMA } from '@no-strova/domain';
import { formatarData, formatarNumero } from './formatters.js';
import { passoDoEixo } from './graficoLinha.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 760;
const A = 340;
const MARGEM_BASE = { topo: 16, base: 30, esquerda: 44 };
const ALTURA_BARRAS = 0.22; // fração da área útil
const ROTULO_SERIE = { fitness: 'Fitness', fadiga: 'Fadiga', forma: 'Forma' };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

function rotuloX(data, mostrarAno) {
  const [ano, mes, dia] = data.split('-');
  return mostrarAno ? `${mes}/${ano.slice(2)}` : `${dia}/${mes}`;
}

const linha = (rotulo, valor) => {
  const el = document.createElement('div');
  const nome = document.createElement('span');
  nome.className = 'grafico-dica-rotulo';
  nome.textContent = `${rotulo} `;
  const v = document.createElement('strong');
  v.textContent = valor;
  el.append(nome, v);
  return el;
};

/**
 * Gráfico de Fitness, Fadiga e Forma em SVG (sem biblioteca): linhas, faixas de Forma ao fundo,
 * barras opcionais de estresse diário, marcador "Hoje" e tooltip por dia.
 * @param {import('@no-strova/domain').DiaForma[]} serie
 * @param {{ barras?: boolean, faixas?: boolean, series?: Array<'fitness'|'fadiga'|'forma'>, marcarHoje?: boolean }} [opcoes]
 */
export function graficoForma(serie, { barras = true, faixas = true, series = ['fitness', 'fadiga', 'forma'], marcarHoje = false } = {}) {
  const container = document.createElement('div');
  container.className = 'grafico';
  if (serie.length < 2) return container;

  const MARGEM = { ...MARGEM_BASE, direita: faixas ? 92 : 14 };
  const largura = L - MARGEM.esquerda - MARGEM.direita;
  const altura = A - MARGEM.topo - MARGEM.base;
  const n = serie.length;

  const valores = serie.flatMap((d) => series.map((campo) => d[campo]));
  const incluiZero = faixas || series.includes('forma');
  const menor = incluiZero ? Math.min(...valores, 0) : Math.min(...valores);
  const maior = incluiZero ? Math.max(...valores, 0) : Math.max(...valores);
  const passoY = passoDoEixo(maior - menor || 10, 5);
  const yMin = Math.floor(menor / passoY) * passoY;
  const yMax = Math.ceil(maior / passoY) * passoY || passoY;

  const px = (i) => MARGEM.esquerda + (i / (n - 1)) * largura;
  const py = (v) => MARGEM.topo + (1 - (v - yMin) / (yMax - yMin)) * altura;

  const raiz = svg('svg', {
    viewBox: `0 0 ${L} ${A}`,
    role: 'img',
    'aria-label': `Gráfico de ${series.map((s) => ROTULO_SERIE[s]).join(', ')} de ${formatarData(serie[0].data)} a ${formatarData(serie[n - 1].data)}`,
  });

  // Faixas de Forma ao fundo, recortadas ao intervalo visível.
  if (faixas) {
    FAIXAS_FORMA.forEach((faixa, i) => {
      const superior = i === 0 ? Number.POSITIVE_INFINITY : FAIXAS_FORMA[i - 1].acimaDe;
      const alto = Math.min(superior, yMax);
      const baixo = Math.max(faixa.acimaDe, yMin);
      if (!(alto > baixo)) return;
      raiz.append(
        svg('rect', { x: MARGEM.esquerda, y: py(alto), width: largura, height: py(baixo) - py(alto), class: `faixa faixa-${faixa.id}` }),
      );
      if (py(baixo) - py(alto) >= 14) {
        raiz.append(svg('text', { x: L - MARGEM.direita + 8, y: (py(alto) + py(baixo)) / 2 + 4, class: 'grafico-rotulo-faixa' }, faixa.rotulo));
      }
    });
  }

  for (let v = yMin; v <= yMax + 1e-9; v += passoY) {
    raiz.append(
      svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: py(v), y2: py(v), class: v === 0 && incluiZero ? 'grafico-zero' : 'grafico-grade' }),
      svg('text', { x: MARGEM.esquerda - 8, y: py(v) + 4, 'text-anchor': 'end', class: 'grafico-rotulo' }, formatarNumero(v)),
    );
  }

  const mostrarAno = n > 120;
  const marcas = Math.min(4, n);
  for (let k = 0; k < marcas; k++) {
    const i = Math.round((k / (marcas - 1 || 1)) * (n - 1));
    const ancora = k === 0 ? 'start' : k === marcas - 1 ? 'end' : 'middle';
    raiz.append(svg('text', { x: px(i), y: A - 8, 'text-anchor': ancora, class: 'grafico-rotulo' }, rotuloX(serie[i].data, mostrarAno)));
  }

  const maxEstresse = Math.max(...serie.map((d) => d.estresse));
  if (barras && maxEstresse > 0) {
    const larguraBarra = Math.max(1, (largura / n) * 0.7);
    serie.forEach((d, i) => {
      if (!(d.estresse > 0)) return;
      const h = (d.estresse / maxEstresse) * altura * ALTURA_BARRAS;
      raiz.append(svg('rect', { x: px(i) - larguraBarra / 2, y: MARGEM.topo + altura - h, width: larguraBarra, height: h, class: 'grafico-barra' }));
    });
  }

  const caminho = (campo) => serie.map((d, i) => `${px(i).toFixed(1)},${py(d[campo]).toFixed(1)}`).join(' ');
  for (const campo of ['fadiga', 'forma', 'fitness']) {
    if (series.includes(campo)) raiz.append(svg('polyline', { points: caminho(campo), class: `serie serie-${campo}` }));
  }

  if (marcarHoje) {
    const ultimo = n - 1;
    raiz.append(
      svg('line', { x1: px(ultimo), x2: px(ultimo), y1: MARGEM.topo, y2: MARGEM.topo + altura, class: 'grafico-hoje' }),
      svg('text', { x: px(ultimo) - 6, y: MARGEM.topo + 12, 'text-anchor': 'end', class: 'grafico-hoje-rotulo' }, 'Hoje'),
      ...series.map((campo) => svg('circle', { cx: px(ultimo), cy: py(serie[ultimo][campo]), r: 4.5, class: `marcador marcador-${campo}` })),
    );
  }

  const guia = svg('line', { y1: MARGEM.topo, y2: MARGEM.topo + altura, class: 'grafico-guia', visibility: 'hidden' });
  const marcadores = series.map((campo) => svg('circle', { r: 4, class: `marcador marcador-${campo}`, visibility: 'hidden' }));
  raiz.append(guia, ...marcadores);

  const dica = document.createElement('div');
  dica.className = 'grafico-dica';
  dica.hidden = true;

  const area = svg('rect', { x: MARGEM.esquerda, y: MARGEM.topo, width: largura, height: altura, fill: 'transparent' });
  area.addEventListener('pointermove', (e) => {
    const caixa = raiz.getBoundingClientRect();
    const xSvg = ((e.clientX - caixa.left) / (caixa.width || 1)) * L;
    const i = Math.min(n - 1, Math.max(0, Math.round(((xSvg - MARGEM.esquerda) / largura) * (n - 1))));
    const d = serie[i];
    guia.setAttribute('x1', px(i));
    guia.setAttribute('x2', px(i));
    guia.setAttribute('visibility', 'visible');
    series.forEach((campo, k) => {
      marcadores[k].setAttribute('cx', px(i));
      marcadores[k].setAttribute('cy', py(d[campo]));
      marcadores[k].setAttribute('visibility', 'visible');
    });
    const faixa = FAIXAS_FORMA.find((f) => f.id === d.faixa);
    dica.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: formatarData(d.data) }),
      ...series.map((campo) =>
        linha(ROTULO_SERIE[campo], campo === 'forma' ? `${formatarNumero(d.forma, 1)} · ${faixa?.rotulo ?? ''}` : formatarNumero(d[campo], 1)),
      ),
      linha('Estresse do dia', formatarNumero(d.estresse, 1)),
    );
    dica.hidden = false;
  });
  area.addEventListener('pointerleave', () => {
    guia.setAttribute('visibility', 'hidden');
    marcadores.forEach((m) => m.setAttribute('visibility', 'hidden'));
    dica.hidden = true;
  });
  raiz.append(area);

  container.append(raiz, dica);
  return container;
}
