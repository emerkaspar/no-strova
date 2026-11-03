const NS = 'http://www.w3.org/2000/svg';
const L = 600;
const A = 240;
const MARGEM = { topo: 12, direita: 12, base: 28, esquerda: 40 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/** Escolhe um passo "redondo" para os rótulos do eixo. */
function passoDoEixo(intervalo, alvo) {
  const bruto = intervalo / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 5, 10]) if (m * potencia >= bruto) return m * potencia;
  return potencia * 10;
}

/**
 * Gráfico de linha em SVG (sem biblioteca) com tooltip por ponto.
 * @param {{ x: number[], y: number[] }} dados x em segundos
 * @param {{ rotuloY: string, formatarX: (x: number) => string, formatarY?: (y: number) => string }} opcoes
 * @returns {{ el: SVGSVGElement, dica: HTMLElement }} o container já montado
 */
export function graficoLinha(dados, { rotuloY, formatarX, formatarY = (y) => String(y) }) {
  const { x, y } = dados;
  const container = document.createElement('div');
  container.className = 'grafico';
  if (x.length < 2) return container;

  const xMin = x[0];
  const xMax = x[x.length - 1];
  const yBruto = [Math.min(...y), Math.max(...y)];
  const passoY = passoDoEixo(yBruto[1] - yBruto[0] || 10, 5);
  const yMin = Math.floor(yBruto[0] / passoY) * passoY;
  const yMax = Math.ceil(yBruto[1] / passoY) * passoY || yMin + passoY;

  const largura = L - MARGEM.esquerda - MARGEM.direita;
  const altura = A - MARGEM.topo - MARGEM.base;
  const px = (v) => MARGEM.esquerda + ((v - xMin) / (xMax - xMin || 1)) * largura;
  const py = (v) => MARGEM.topo + (1 - (v - yMin) / (yMax - yMin || 1)) * altura;

  const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': `Gráfico de ${rotuloY} ao longo do tempo` });

  for (let v = yMin; v <= yMax; v += passoY) {
    raiz.append(
      svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: py(v), y2: py(v), class: 'grafico-grade' }),
      svg('text', { x: MARGEM.esquerda - 6, y: py(v) + 4, 'text-anchor': 'end', class: 'grafico-rotulo' }, formatarY(v)),
    );
  }
  const passoX = passoDoEixo(xMax - xMin, 6);
  for (let v = Math.ceil(xMin / passoX) * passoX; v <= xMax; v += passoX) {
    raiz.append(svg('text', { x: px(v), y: A - 8, 'text-anchor': 'middle', class: 'grafico-rotulo' }, formatarX(v)));
  }

  raiz.append(svg('polyline', { points: x.map((v, i) => `${px(v).toFixed(1)},${py(y[i]).toFixed(1)}`).join(' '), class: 'grafico-linha' }));

  const marcador = svg('circle', { r: 4, class: 'grafico-marcador', visibility: 'hidden' });
  const dica = document.createElement('div');
  dica.className = 'grafico-dica';
  dica.hidden = true;
  raiz.append(marcador);

  const area = svg('rect', { x: MARGEM.esquerda, y: MARGEM.topo, width: largura, height: altura, fill: 'transparent' });
  area.addEventListener('pointermove', (e) => {
    const caixa = raiz.getBoundingClientRect();
    const xSvg = ((e.clientX - caixa.left) / caixa.width) * L;
    const alvo = xMin + ((xSvg - MARGEM.esquerda) / largura) * (xMax - xMin);
    let melhor = 0;
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - alvo) < Math.abs(x[melhor] - alvo)) melhor = i;
    marcador.setAttribute('cx', px(x[melhor]));
    marcador.setAttribute('cy', py(y[melhor]));
    marcador.setAttribute('visibility', 'visible');
    dica.textContent = `${formatarX(x[melhor])} · ${formatarY(y[melhor])} ${rotuloY}`;
    dica.hidden = false;
  });
  area.addEventListener('pointerleave', () => {
    marcador.setAttribute('visibility', 'hidden');
    dica.hidden = true;
  });
  raiz.append(area);

  container.append(raiz, dica);
  return container;
}
