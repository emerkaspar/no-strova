import { passoDoEixo } from '../../../utils/graficoLinha.js';
import { formatarData } from '../../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 640;
const A = 260;
const MARGEM = { topo: 14, direita: 14, base: 30, esquerda: 52 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

const dia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
};
const isoDoDia = (d) => new Date(d * 86400000).toISOString().slice(0, 10);

/** Faixa do eixo Y com folga, a partir dos valores; evita eixo achatado quando todos os valores são iguais. */
function faixaY(valores, passoMinimo) {
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < passoMinimo * 4) {
    const meio = (min + max) / 2;
    min = meio - passoMinimo * 2;
    max = meio + passoMinimo * 2;
  }
  const folga = (max - min) * 0.1;
  return { min: min - folga, max: max + folga };
}

/** Desenha o gráfico na largura real do container (e de novo ao redimensionar), para textos e pontos não esticarem. */
function comLarguraReal(container, desenhar) {
  let atual = 0;
  const redesenhar = (largura) => {
    const l = Math.max(300, Math.round(largura));
    if (l === atual) return;
    atual = l;
    container.querySelector('svg')?.remove();
    container.prepend(desenhar(l));
  };
  redesenhar(container.clientWidth || 640);
  if (typeof ResizeObserver !== 'undefined') {
    const obs = new ResizeObserver((entradas) => {
      if (!container.isConnected) return obs.disconnect();
      redesenhar(entradas[0].contentRect.width);
    });
    obs.observe(container);
  }
}

function criarDica() {
  const dica = document.createElement('div');
  dica.className = 'grafico-dica';
  dica.hidden = true;
  return dica;
}

/**
 * Evolução de uma métrica por passagem, no tempo: um ponto por passagem, linha de tendência e destaque para as passagens
 * selecionadas (para comparar), para o pódio e para as que têm calor, frio ou outro fator de contexto.
 *
 * @param {object} p
 * @param {Array<object>} p.passagens em ordem de data
 * @param {{ rotulo: string, campo: (p: object) => number|null, formatar: (v: number) => string, invertido: boolean, passoMinimo: number }} p.metrica
 * @param {Set<string>} p.selecionadas ids selecionados para comparar
 * @param {Map<string, string>} p.podio id → 'ouro' | 'prata' | 'bronze'
 * @param {Map<string, string[]>} p.contexto id → fatores (rótulos) que podem explicar a passagem
 * @param {null | { valorEm: (iso: string) => number }} p.tendencia
 * @param {(id: string) => void} p.aoAlternar chamado ao clicar (ou Enter/Espaço) em um ponto
 */
export function graficoEvolucao({ passagens, metrica, selecionadas, podio, contexto, tendencia, aoAlternar }) {
  const container = document.createElement('div');
  container.className = 'grafico traj-grafico';
  const pontos = passagens.map((p) => ({ p, x: dia(p.data), y: metrica.campo(p) })).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  if (pontos.length < 1) {
    container.append(Object.assign(document.createElement('p'), { className: 'vazio-curto', textContent: 'Sem dados desta métrica nas passagens.' }));
    return container;
  }

  const dica = criarDica();
  container.append(dica);
  comLarguraReal(container, (L) => {
    const xMin = Math.min(...pontos.map((q) => q.x));
    const xMax = Math.max(...pontos.map((q) => q.x));
    const { min: yMin, max: yMax } = faixaY(pontos.map((q) => q.y), metrica.passoMinimo);
    const largura = L - MARGEM.esquerda - MARGEM.direita;
    const altura = A - MARGEM.topo - MARGEM.base;
    const px = (v) => MARGEM.esquerda + (xMax === xMin ? 0.5 : (v - xMin) / (xMax - xMin)) * largura;
    // voltas da mesma atividade caem no mesmo dia: afasta um pouco os pontos para não ficarem um sobre o outro
    const afastar = (p) => (p.totalVoltas > 1 ? (p.volta - 1 - (p.totalVoltas - 1) / 2) * 12 : 0);
    const frac = (v) => (v - yMin) / (yMax - yMin || 1);
    const py = (v) => MARGEM.topo + (metrica.invertido ? frac(v) : 1 - frac(v)) * altura;

    const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'group', 'aria-label': `Evolução de ${metrica.rotulo.toLowerCase()} por passagem` });

    const passoY = passoDoEixo(yMax - yMin, 4);
    for (let v = Math.ceil(yMin / passoY) * passoY; v <= yMax; v += passoY) {
      raiz.append(
        svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: py(v), y2: py(v), class: 'grafico-grade' }),
        svg('text', { x: MARGEM.esquerda - 6, y: py(v) + 4, 'text-anchor': 'end', class: 'grafico-rotulo' }, metrica.formatar(v).replace(/ (m\/min por bpm)$/, '')),
      );
    }
    const passoX = Math.max(1, passoDoEixo(xMax - xMin || 1, 5));
    for (let v = Math.ceil(xMin / passoX) * passoX; v <= xMax; v += passoX) {
      const [, mes, d] = isoDoDia(v).split('-');
      raiz.append(svg('text', { x: px(v), y: A - 9, 'text-anchor': 'middle', class: 'grafico-rotulo' }, `${d}/${mes}`));
    }

    if (tendencia && pontos.length >= 3) {
      raiz.append(
        svg('line', {
          x1: px(xMin),
          x2: px(xMax),
          y1: py(tendencia.valorEm(isoDoDia(xMin))),
          y2: py(tendencia.valorEm(isoDoDia(xMax))),
          class: 'traj-tendencia',
        }),
      );
    }
    if (pontos.length >= 2) {
      raiz.append(svg('polyline', { points: pontos.map((q) => `${(px(q.x) + afastar(q.p)).toFixed(1)},${py(q.y).toFixed(1)}`).join(' '), class: 'grafico-linha traj-linha' }));
    }

    for (const { p, x, y } of pontos) {
      const medalha = podio.get(p.id);
      const fatores = contexto.get(p.id) ?? [];
      const sel = selecionadas.has(p.id);
      const classes = ['traj-ponto', medalha ? `traj-ponto-${medalha}` : '', fatores.length ? 'traj-ponto-contexto' : '', sel ? 'traj-ponto-sel' : ''].filter(Boolean).join(' ');
      const texto = `${formatarData(p.data)}${p.totalVoltas > 1 ? ` (volta ${p.volta})` : ''} · ${metrica.formatar(y)}${medalha ? ` · ${medalha}` : ''}${fatores.length ? ` · ${fatores.join(', ')}` : ''}`;
      const ponto = svg('circle', {
        cx: (px(x) + afastar(p)).toFixed(1),
        cy: py(y).toFixed(1),
        r: sel ? 7 : 5.5,
        class: classes,
        tabindex: 0,
        role: 'button',
        'aria-pressed': String(sel),
        'aria-label': `${texto}. ${sel ? 'Selecionada' : 'Selecionar'} para comparar.`,
      });
      const mostrar = () => {
        dica.textContent = texto;
        dica.hidden = false;
      };
      ponto.addEventListener('pointerenter', mostrar);
      ponto.addEventListener('focus', mostrar);
      ponto.addEventListener('pointerleave', () => (dica.hidden = true));
      ponto.addEventListener('blur', () => (dica.hidden = true));
      ponto.addEventListener('click', () => aoAlternar(p.id));
      ponto.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          aoAlternar(p.id);
        }
      });
      raiz.append(ponto);
    }
    return raiz;
  });
  return container;
}

/** Média móvel simples (janela ímpar), ignorando vazios; deixa a curva legível sem inventar pontos. */
export function suavizar(valores, janela = 5) {
  const meio = Math.floor(janela / 2);
  return valores.map((_, i) => {
    let soma = 0;
    let n = 0;
    for (let k = Math.max(0, i - meio); k <= Math.min(valores.length - 1, i + meio); k++) {
      if (Number.isFinite(valores[k])) {
        soma += valores[k];
        n += 1;
      }
    }
    return n ? soma / n : null;
  });
}

/**
 * Duas (ou mais) passagens sobrepostas no mesmo eixo de distância (km desde o início do trecho).
 * @param {Array<{ rotulo: string, classe: string, x: Array<number|null>, y: Array<number|null> }>} linhas
 * @param {{ rotuloY: string, formatarY: (v: number) => string, invertido?: boolean, passoMinimo?: number }} opcoes
 */
export function graficoSobreposto(linhas, { rotuloY, formatarY, invertido = false, passoMinimo = 1 }) {
  const container = document.createElement('div');
  container.className = 'grafico traj-grafico';
  const limpas = linhas.map((l) => ({ ...l, pares: l.x.map((x, i) => [x, l.y[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) }));
  const todos = limpas.flatMap((l) => l.pares);
  if (todos.length < 2) {
    container.append(Object.assign(document.createElement('p'), { className: 'vazio-curto', textContent: `Sem ${rotuloY.toLowerCase()} detalhada nestas passagens.` }));
    return container;
  }
  const xMax = Math.max(...todos.map(([x]) => x)) || 1;
  const { min: yMin, max: yMax } = faixaY(todos.map(([, y]) => y), passoMinimo);
  const largura = L - MARGEM.esquerda - MARGEM.direita;
  const altura = A - MARGEM.topo - MARGEM.base;
  const px = (v) => MARGEM.esquerda + (v / xMax) * largura;
  const frac = (v) => (v - yMin) / (yMax - yMin || 1);
  const py = (v) => MARGEM.topo + (invertido ? frac(v) : 1 - frac(v)) * altura;

  const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': `${rotuloY} das passagens sobrepostas por distância` });
  const passoY = passoDoEixo(yMax - yMin, 4);
  for (let v = Math.ceil(yMin / passoY) * passoY; v <= yMax; v += passoY) {
    raiz.append(
      svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: py(v), y2: py(v), class: 'grafico-grade' }),
      svg('text', { x: MARGEM.esquerda - 6, y: py(v) + 4, 'text-anchor': 'end', class: 'grafico-rotulo' }, formatarY(v)),
    );
  }
  const passoX = passoDoEixo(xMax, 6);
  for (let v = 0; v <= xMax; v += passoX) {
    raiz.append(svg('text', { x: px(v), y: A - 9, 'text-anchor': 'middle', class: 'grafico-rotulo' }, `${String(Math.round(v * 10) / 10).replace('.', ',')} km`));
  }
  for (const l of limpas) {
    raiz.append(svg('polyline', { points: l.pares.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' '), class: `traj-curva ${l.classe}` }));
  }

  const dica = criarDica();
  const cursor = svg('line', { y1: MARGEM.topo, y2: MARGEM.topo + altura, class: 'traj-cursor', visibility: 'hidden' });
  raiz.append(cursor);
  const area = svg('rect', { x: MARGEM.esquerda, y: MARGEM.topo, width: largura, height: altura, fill: 'transparent' });
  area.addEventListener('pointermove', (e) => {
    const caixa = raiz.getBoundingClientRect();
    const xKm = Math.max(0, Math.min(xMax, ((((e.clientX - caixa.left) / caixa.width) * L - MARGEM.esquerda) / largura) * xMax));
    const partes = limpas.map((l) => {
      let melhor = null;
      for (const par of l.pares) if (melhor === null || Math.abs(par[0] - xKm) < Math.abs(melhor[0] - xKm)) melhor = par;
      return melhor ? `${l.rotulo}: ${formatarY(melhor[1])}` : null;
    });
    cursor.setAttribute('x1', px(xKm));
    cursor.setAttribute('x2', px(xKm));
    cursor.setAttribute('visibility', 'visible');
    dica.textContent = `${String(Math.round(xKm * 100) / 100).replace('.', ',')} km · ${partes.filter(Boolean).join(' · ')}`;
    dica.hidden = false;
  });
  area.addEventListener('pointerleave', () => {
    cursor.setAttribute('visibility', 'hidden');
    dica.hidden = true;
  });
  raiz.append(area);

  container.append(raiz, dica);
  return container;
}

/** Miniatura da tendência do trajeto para o badge: uma linha sem eixos, melhor em cima. */
export function miniTendencia(valores, invertido) {
  const v = valores.filter(Number.isFinite);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const W = 84;
  const H = 26;
  const pontos = v.map((y, i) => {
    const f = max === min ? 0.5 : (y - min) / (max - min);
    return `${((i / (v.length - 1)) * (W - 4) + 2).toFixed(1)},${((invertido ? f : 1 - f) * (H - 6) + 3).toFixed(1)}`;
  });
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'traj-mini', 'aria-hidden': 'true' }, svg('polyline', { points: pontos.join(' ') }));
}
