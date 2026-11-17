import { diasEntre, serieDeMediaMovel, somarDias } from '@no-strova/domain';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 1100;
const A = 230;
const MARGEM = { esquerda: 44, direita: 20, topo: 18, base: 26 };

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
  { id: '1a', rotulo: '1 ano', dias: 365 },
  { id: 'tudo', rotulo: 'Tudo', dias: null },
]);

/** Menos que isso, ou mais de 7 dias entre pesagens em média, e a média móvel de 7 dias não diz nada: o gráfico mostra as pesagens ligadas. */
const MINIMO_DE_PONTOS_PARA_MEDIA = 8;
const DIAS_ENTRE_PESAGENS_ESPARSAS = 7;
/** O gráfico nunca mostra menos que isto (um eixo de poucos dias deixaria as pesagens coladas). */
const MINIMO_DE_DIAS_NO_EIXO = 14;

/** Passo "redondo" do eixo vertical para dividir `faixa` kg em cerca de 4 partes. */
function passoDoEixo(faixa) {
  const alvo = faixa / 3;
  return [0.5, 1, 2, 2.5, 5, 10, 20].find((p) => p >= alvo) ?? 20;
}

/**
 * Gráfico de peso (SVG, sem biblioteca). Com muitas pesagens: pontos pequenos e a média móvel de 7 dias. Com poucas (por
 * exemplo, uma por mês): as pesagens ligadas por uma linha, com o valor escrito em cada ponto e as datas do eixo nas próprias
 * pesagens. A meta é uma linha horizontal com o valor e a data; `comProjecao` estende o eixo até a data da meta e desenha a
 * trajetória até ela (por padrão o eixo termina em hoje, para os dados ocuparem o gráfico).
 * `raiz.dataset.modo` diz qual dos dois modos foi usado ('denso' ou 'esparso').
 * @param {{ pesagens: Array<{ data: string, pesoKg: number }>, meta: { pesoAlvoKg: number, dataAlvo: string }|null, hoje: string, periodoId: string, faixa?: { minKg: number, maxKg: number }|null, comProjecao?: boolean }} p
 *   `faixa`: faixa de peso saudável (IMC normal), desenhada como uma área ao fundo
 * @returns {SVGSVGElement|null} null quando não há pesagens na janela
 */
export function criarGraficoPeso({ pesagens, meta, hoje, periodoId, faixa = null, comProjecao = false }) {
  const ordenadas = [...pesagens].sort((a, b) => (a.data < b.data ? -1 : 1));
  if (ordenadas.length === 0) return null;
  const periodo = PERIODOS_DO_PESO.find((p) => p.id === periodoId) ?? PERIODOS_DO_PESO[0];
  const inicioDoPeriodo = periodo.dias === null ? ordenadas[0].data : somarDias(hoje, -periodo.dias);
  const pontos = ordenadas.filter((p) => p.data >= inicioDoPeriodo && p.data <= hoje);
  if (pontos.length === 0) return null;

  const metaNoFuturo = meta && meta.dataAlvo > hoje ? meta : null;
  const projetar = comProjecao && metaNoFuturo !== null;
  const esparso = pontos.length < MINIMO_DE_PONTOS_PARA_MEDIA || diasEntre(pontos[0].data, pontos[pontos.length - 1].data) / Math.max(1, pontos.length - 1) > DIAS_ENTRE_PESAGENS_ESPARSAS;
  const media = esparso ? [] : serieDeMediaMovel(ordenadas, hoje).filter((m) => m.data >= inicioDoPeriodo);

  // eixo do tempo: começa um pouco antes da primeira pesagem do período e termina em hoje (ou na meta, se for projetar)
  const primeira = pontos[0].data;
  const vao = diasEntre(primeira, hoje);
  let inicio = somarDias(primeira, -Math.max(2, Math.round(vao * 0.05)));
  if (inicio < inicioDoPeriodo) inicio = inicioDoPeriodo;
  if (diasEntre(inicio, hoje) < MINIMO_DE_DIAS_NO_EIXO) inicio = somarDias(hoje, -MINIMO_DE_DIAS_NO_EIXO);
  const fim = projetar ? metaNoFuturo.dataAlvo : somarDias(hoje, Math.max(2, Math.round(diasEntre(inicio, hoje) * 0.04)));
  const total = Math.max(1, diasEntre(inicio, fim));
  const largura = L - MARGEM.esquerda - MARGEM.direita;
  const x = (data) => MARGEM.esquerda + (diasEntre(inicio, data) / total) * largura;

  // eixo do peso: limites "redondos", incluindo a meta
  const valores = [...pontos.map((p) => p.pesoKg), ...media.map((m) => m.mediaKg), ...(meta ? [meta.pesoAlvoKg] : [])];
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const passo = passoDoEixo(Math.max(maior - menor, 2));
  const minimo = Math.floor((menor - passo * 0.4) / passo) * passo;
  const maximo = Math.ceil((maior + passo * 0.4) / passo) * passo;
  const y = (kg) => MARGEM.topo + (1 - (kg - minimo) / (maximo - minimo)) * (A - MARGEM.topo - MARGEM.base);

  const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, class: 'peso-grafico', role: 'img', 'aria-label': `Gráfico do peso: ${pontos.length} pesagem${pontos.length === 1 ? '' : 's'}, de ${formatarData(pontos[0].data)} a ${formatarData(pontos[pontos.length - 1].data)}` });
  raiz.dataset.modo = esparso ? 'esparso' : 'denso';

  // faixa de peso saudável (só a parte que cabe na escala do gráfico)
  if (faixa && faixa.maxKg > minimo && faixa.minKg < maximo) {
    const topo = y(Math.min(maximo, faixa.maxKg));
    const base = y(Math.max(minimo, faixa.minKg));
    raiz.append(svg('rect', { x: MARGEM.esquerda, y: topo, width: largura, height: base - topo, class: 'peso-faixa' }, svg('title', {}, `Faixa de peso saudável: ${formatarNumero(faixa.minKg, 1)} a ${formatarNumero(faixa.maxKg, 1)} kg (IMC 18,5 a 24,9)`)));
  }

  // grade e rótulos do eixo do peso
  for (let kg = minimo; kg <= maximo + 1e-9; kg += passo) {
    raiz.append(svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: y(kg), y2: y(kg), class: 'peso-grade' }));
    const rotulo = svg('text', { x: MARGEM.esquerda - 8, y: y(kg) + 4, class: 'peso-rotulo', 'text-anchor': 'end' });
    rotulo.textContent = formatarNumero(kg, passo < 1 ? 1 : 0);
    raiz.append(rotulo);
  }

  // datas do eixo: nas próprias pesagens quando são poucas; senão, cinco datas espaçadas por igual
  const datasDoEixo = pontos.length <= 6 && esparso ? pontos.map((p) => p.data) : Array.from({ length: 5 }, (_, i) => somarDias(inicio, Math.round(((fim === inicio ? 1 : total) * i) / 4)));
  let ultimoX = -Infinity;
  datasDoEixo.forEach((data, i) => {
    const px = x(data);
    if (px - ultimoX < 56) return; // não deixa as datas se atropelarem
    ultimoX = px;
    const rotulo = svg('text', { x: px, y: A - 8, class: 'peso-rotulo', 'text-anchor': i === 0 && !esparso ? 'start' : 'middle' });
    rotulo.textContent = formatarData(data).slice(0, 5);
    raiz.append(rotulo);
  });

  // linha do dia de hoje, quando o eixo avança para o futuro (projeção até a meta)

  // meta: linha horizontal com o valor e a data; com projeção, também a trajetória do último peso até a data-alvo
  if (meta) {
    const yMeta = y(meta.pesoAlvoKg);
    raiz.append(svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: yMeta, y2: yMeta, class: 'peso-alvo' }));
    const acima = yMeta > MARGEM.topo + 16;
    const textoMeta = svg('text', { x: L - MARGEM.direita - 4, y: acima ? yMeta - 6 : yMeta + 14, class: 'peso-rotulo peso-rotulo-meta', 'text-anchor': 'end' });
    textoMeta.textContent = `Meta ${formatarNumero(meta.pesoAlvoKg, 1)} kg${meta.dataAlvo ? ` · ${formatarData(meta.dataAlvo)}` : ''}`;
    raiz.append(textoMeta);
    if (projetar) {
      const ultimo = media.length > 0 ? { data: media[media.length - 1].data, kg: media[media.length - 1].mediaKg } : { data: pontos[pontos.length - 1].data, kg: pontos[pontos.length - 1].pesoKg };
      raiz.append(svg('line', { x1: x(ultimo.data), y1: y(ultimo.kg), x2: x(meta.dataAlvo), y2: yMeta, class: 'peso-meta' }));
      const cx = x(meta.dataAlvo);
      raiz.append(svg('path', { d: `M${cx} ${yMeta - 5} L${cx + 5} ${yMeta} L${cx} ${yMeta + 5} L${cx - 5} ${yMeta} Z`, class: 'peso-losango' }, svg('title', {}, `Meta: ${formatarNumero(meta.pesoAlvoKg, 1)} kg em ${formatarData(meta.dataAlvo)}`)));
    }
  }

  // linha: a média móvel de 7 dias (muitas pesagens) ou as próprias pesagens ligadas (poucas)
  const serieDaLinha = esparso ? pontos.map((p) => ({ data: p.data, kg: p.pesoKg })) : media.map((m) => ({ data: m.data, kg: m.mediaKg }));
  if (serieDaLinha.length > 1) raiz.append(svg('polyline', { points: serieDaLinha.map((m) => `${x(m.data).toFixed(1)},${y(m.kg).toFixed(1)}`).join(' '), class: 'peso-media' }));

  // pesagens: com poucas, o valor fica escrito em cima de cada ponto (e a variação, quando há espaço)
  let ultimoRotuloX = -Infinity;
  pontos.forEach((p, i) => {
    const cx = x(p.data);
    const cy = y(p.pesoKg);
    const ponto = svg('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: esparso ? 4 : pontos.length > 120 ? 2 : 3, class: 'peso-ponto' });
    ponto.append(svg('title', {}, `${formatarData(p.data)}: ${formatarNumero(p.pesoKg, 1)} kg`));
    raiz.append(ponto);
    if (esparso && pontos.length <= 14 && (cx - ultimoRotuloX >= 46 || i === pontos.length - 1)) {
      const abaixo = cy < MARGEM.topo + 14;
      const valor = svg('text', { x: cx.toFixed(1), y: (abaixo ? cy + 17 : cy - 9).toFixed(1), class: 'peso-valor', 'text-anchor': 'middle' });
      valor.textContent = formatarNumero(p.pesoKg, 1);
      raiz.append(valor);
      ultimoRotuloX = cx;
    }
  });
  return raiz;
}
