import { FAIXAS_FORMA } from '@no-strova/domain';
import { formatarData, formatarForma, formatarNumero } from './formatters.js';
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
 * barras opcionais de estresse diário, marcador "Hoje", projeção do plano e meta de forma, com tooltip por dia.
 * @param {Array<import('@no-strova/domain').DiaForma & { projetado?: boolean }>} serie
 * @param {{
 *   barras?: boolean, faixas?: boolean, series?: Array<'fitness'|'fadiga'|'forma'>, marcarHoje?: boolean,
 *   projecao?: boolean, meta?: { dataAlvo: string, formaAlvo: number }|null
 * }} [opcoes]
 *   `projecao`: os dias com `projetado` saem tracejados, sobre uma região sombreada "Projeção do plano";
 *   `meta`: marca o alvo (data e Forma) no gráfico.
 */
export function graficoForma(
  serie,
  { barras = true, faixas = true, series = ['fitness', 'fadiga', 'forma'], marcarHoje = false, projecao = false, meta = null } = {},
) {
  const container = document.createElement('div');
  container.className = 'grafico';
  if (serie.length < 2) return container;

  const MARGEM = { ...MARGEM_BASE, direita: faixas ? 92 : 14 };
  const largura = L - MARGEM.esquerda - MARGEM.direita;
  const altura = A - MARGEM.topo - MARGEM.base;
  const n = serie.length;

  const indiceMeta = meta ? serie.findIndex((d) => d.data === meta.dataAlvo) : -1;
  const valores = serie.flatMap((d) => series.map((campo) => d[campo]));
  if (indiceMeta >= 0) valores.push(meta.formaAlvo);
  const incluiZero = faixas || series.includes('forma');
  const menor = incluiZero ? Math.min(...valores, 0) : Math.min(...valores);
  const maior = incluiZero ? Math.max(...valores, 0) : Math.max(...valores);
  const passoY = passoDoEixo(maior - menor || 10, 5);
  const yMin = Math.floor(menor / passoY) * passoY;
  const yMax = Math.ceil(maior / passoY) * passoY || passoY;

  const px = (i) => MARGEM.esquerda + (i / (n - 1)) * largura;
  const py = (v) => MARGEM.topo + (1 - (v - yMin) / (yMax - yMin)) * altura;

  // Último dia que não é projeção (hoje). Sem projeção, é o último ponto da série.
  const primeiroProjetado = projecao ? serie.findIndex((d) => d.projetado) : -1;
  const temProjecao = primeiroProjetado > 0;
  const indiceHoje = temProjecao ? primeiroProjetado - 1 : n - 1;

  const raiz = svg('svg', {
    viewBox: `0 0 ${L} ${A}`,
    role: 'img',
    'aria-label': `Gráfico de ${series.map((s) => ROTULO_SERIE[s]).join(', ')} de ${formatarData(serie[0].data)} a ${formatarData(serie[n - 1].data)}${temProjecao ? ', com projeção do plano' : ''}`,
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

  // Região da projeção: sombreada, do dia de hoje até o fim
  if (temProjecao) {
    raiz.append(
      svg('rect', { x: px(indiceHoje), y: MARGEM.topo, width: px(n - 1) - px(indiceHoje), height: altura, class: 'grafico-projecao' }),
      svg('text', { x: px(indiceHoje) + 8, y: MARGEM.topo + 12, class: 'grafico-projecao-rotulo' }, 'Projeção do plano'),
    );
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
      raiz.append(svg('rect', { x: px(i) - larguraBarra / 2, y: MARGEM.topo + altura - h, width: larguraBarra, height: h, class: `grafico-barra${d.projetado ? ' grafico-barra-projetada' : ''}` }));
    });
  }

  const pontos = (campo, de, ate) =>
    serie
      .slice(de, ate + 1)
      .map((d, k) => `${px(de + k).toFixed(1)},${py(d[campo]).toFixed(1)}`)
      .join(' ');
  for (const campo of ['fadiga', 'forma', 'fitness']) {
    if (!series.includes(campo)) continue;
    // Realizado em linha cheia; projeção tracejada, ligada ao ponto de hoje.
    raiz.append(svg('polyline', { points: pontos(campo, 0, indiceHoje), class: `serie serie-${campo}` }));
    if (temProjecao) raiz.append(svg('polyline', { points: pontos(campo, indiceHoje, n - 1), class: `serie serie-${campo} serie-projetada` }));
  }

  if (marcarHoje) {
    raiz.append(
      svg('line', { x1: px(indiceHoje), x2: px(indiceHoje), y1: MARGEM.topo, y2: MARGEM.topo + altura, class: 'grafico-hoje' }),
      svg('text', { x: px(indiceHoje) - 6, y: MARGEM.topo + 12, 'text-anchor': 'end', class: 'grafico-hoje-rotulo' }, 'Hoje'),
      ...series.map((campo) => svg('circle', { cx: px(indiceHoje), cy: py(serie[indiceHoje][campo]), r: 4.5, class: `marcador marcador-${campo}` })),
    );
  }

  // Meta de forma: losango no alvo e a Forma desejada escrita ao lado
  if (indiceMeta >= 0) {
    const cx = px(indiceMeta);
    const cy = py(meta.formaAlvo);
    const ancora = indiceMeta > n * 0.8 ? 'end' : 'start';
    raiz.append(
      svg('path', { d: `M ${cx} ${cy - 8} L ${cx + 8} ${cy} L ${cx} ${cy + 8} L ${cx - 8} ${cy} Z`, class: 'meta-marcador' }),
      svg('text', { x: cx + (ancora === 'end' ? -12 : 12), y: cy - 10, 'text-anchor': ancora, class: 'meta-rotulo' }, `Meta ${formatarForma(meta.formaAlvo, 1)}`),
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
      Object.assign(document.createElement('strong'), { textContent: `${formatarData(d.data)}${d.projetado ? ' · projeção' : ''}` }),
      ...series.map((campo) =>
        linha(ROTULO_SERIE[campo], campo === 'forma' ? `${formatarNumero(d.forma, 1)} · ${faixa?.rotulo ?? ''}` : formatarNumero(d[campo], 1)),
      ),
      linha(d.projetado ? 'Estresse planejado' : 'Estresse do dia', formatarNumero(d.estresse, 1)),
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
