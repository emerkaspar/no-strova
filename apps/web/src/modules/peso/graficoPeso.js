import { diasEntre, serieDeMediaMovel, somarDias } from '@no-strova/domain';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 800;
const A = 300;
const MARGEM = { esquerda: 52, direita: 20, topo: 16, base: 30 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  for (const f of filhos) if (f !== null && f !== undefined) el.append(f);
  return el;
}

/** Janelas do gráfico, em dias antes de hoje (null = desde a primeira pesagem). */
export const PERIODOS_DO_PESO = Object.freeze([
  { id: '30d', rotulo: '30 dias', dias: 30 },
  { id: '90d', rotulo: '90 dias', dias: 90 },
  { id: '6m', rotulo: '6 meses', dias: 182 },
  { id: 'tudo', rotulo: 'Tudo', dias: null },
]);

/**
 * Gráfico de peso (SVG, sem biblioteca): pesagens (pontos), média móvel de 7 dias (linha) e a meta (tracejada até a
 * data-alvo, com um losango).
 * @param {{ pesagens: Array<{ data: string, pesoKg: number }>, meta: { pesoAlvoKg: number, dataAlvo: string }|null, hoje: string, periodoId: string, faixa?: { minKg: number, maxKg: number }|null }} p
 *   `faixa`: faixa de peso saudável (IMC normal), desenhada como uma área ao fundo
 * @returns {SVGSVGElement|null} null quando não há pesagens na janela
 */
export function criarGraficoPeso({ pesagens, meta, hoje, periodoId, faixa = null }) {
  const ordenadas = [...pesagens].sort((a, b) => (a.data < b.data ? -1 : 1));
  if (ordenadas.length === 0) return null;
  const periodo = PERIODOS_DO_PESO.find((p) => p.id === periodoId) ?? PERIODOS_DO_PESO[1];
  const inicio = periodo.dias === null ? ordenadas[0].data : somarDias(hoje, -periodo.dias);
  const metaNoFuturo = meta && meta.dataAlvo > hoje ? meta : null;
  const fim = metaNoFuturo ? metaNoFuturo.dataAlvo : hoje;
  const pontos = ordenadas.filter((p) => p.data >= inicio && p.data <= hoje);
  const media = serieDeMediaMovel(ordenadas, hoje).filter((m) => m.data >= inicio);
  if (pontos.length === 0 && media.length === 0) return null;

  const valores = [...pontos.map((p) => p.pesoKg), ...media.map((m) => m.mediaKg), ...(meta ? [meta.pesoAlvoKg] : [])];
  const minimo = Math.floor(Math.min(...valores) - 1);
  const maximo = Math.ceil(Math.max(...valores) + 1);
  const total = Math.max(1, diasEntre(inicio, fim));
  const x = (data) => MARGEM.esquerda + (diasEntre(inicio, data) / total) * (L - MARGEM.esquerda - MARGEM.direita);
  const y = (kg) => MARGEM.topo + (1 - (kg - minimo) / (maximo - minimo)) * (A - MARGEM.topo - MARGEM.base);

  const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, class: 'peso-grafico', role: 'img', 'aria-label': 'Gráfico do peso ao longo do tempo' });

  // faixa de peso saudável (só a parte que cabe na escala do gráfico)
  if (faixa && faixa.maxKg > minimo && faixa.minKg < maximo) {
    const topo = y(Math.min(maximo, faixa.maxKg));
    const base = y(Math.max(minimo, faixa.minKg));
    raiz.append(svg('rect', { x: MARGEM.esquerda, y: topo, width: L - MARGEM.esquerda - MARGEM.direita, height: base - topo, class: 'peso-faixa' }, svg('title', {}, `Faixa de peso saudável: ${formatarNumero(faixa.minKg, 1)} a ${formatarNumero(faixa.maxKg, 1)} kg (IMC 18,5 a 24,9)`)));
  }

  // grade e rótulos do eixo do peso
  const passos = 4;
  for (let i = 0; i <= passos; i++) {
    const kg = minimo + ((maximo - minimo) * i) / passos;
    raiz.append(svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: y(kg), y2: y(kg), class: 'peso-grade' }));
    const rotulo = svg('text', { x: MARGEM.esquerda - 8, y: y(kg) + 4, class: 'peso-rotulo', 'text-anchor': 'end' });
    rotulo.textContent = formatarNumero(kg, 1);
    raiz.append(rotulo);
  }

  // rótulos de data (cinco, espaçados por igual)
  for (let i = 0; i <= 4; i++) {
    const data = somarDias(inicio, Math.round((total * i) / 4));
    const rotulo = svg('text', { x: x(data), y: A - 8, class: 'peso-rotulo', 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' });
    rotulo.textContent = formatarData(data).slice(0, 5);
    raiz.append(rotulo);
  }

  // linha do dia de hoje, quando a meta estende o gráfico para o futuro
  if (metaNoFuturo) raiz.append(svg('line', { x1: x(hoje), x2: x(hoje), y1: MARGEM.topo, y2: A - MARGEM.base, class: 'peso-hoje' }));

  // meta: do último ponto até a data-alvo
  if (meta) {
    const ultimo = media.length > 0 ? { data: media[media.length - 1].data, kg: media[media.length - 1].mediaKg } : null;
    const dataMeta = meta.dataAlvo >= inicio && meta.dataAlvo <= fim ? meta.dataAlvo : null;
    if (ultimo && dataMeta) raiz.append(svg('line', { x1: x(ultimo.data), y1: y(ultimo.kg), x2: x(dataMeta), y2: y(meta.pesoAlvoKg), class: 'peso-meta' }));
    raiz.append(svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: y(meta.pesoAlvoKg), y2: y(meta.pesoAlvoKg), class: 'peso-alvo' }));
    if (dataMeta) {
      const cx = x(dataMeta);
      const cy = y(meta.pesoAlvoKg);
      raiz.append(svg('path', { d: `M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z`, class: 'peso-losango' }, svg('title', {}, `Meta: ${formatarNumero(meta.pesoAlvoKg, 1)} kg em ${formatarData(meta.dataAlvo)}`)));
    }
  }

  // média móvel e pesagens
  if (media.length > 1) raiz.append(svg('polyline', { points: media.map((m) => `${x(m.data).toFixed(1)},${y(m.mediaKg).toFixed(1)}`).join(' '), class: 'peso-media' }));
  for (const p of pontos) {
    const ponto = svg('circle', { cx: x(p.data).toFixed(1), cy: y(p.pesoKg).toFixed(1), r: pontos.length > 120 ? 2 : 3.5, class: 'peso-ponto' });
    ponto.append(svg('title', {}, `${formatarData(p.data)}: ${formatarNumero(p.pesoKg, 1)} kg`));
    raiz.append(ponto);
  }
  return raiz;
}
