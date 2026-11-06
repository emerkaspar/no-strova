import { lerSerieDetalhe } from '../../infrastructure/atividadesRepo.js';
import { h } from '../../utils/dom.js';

const NS = 'http://www.w3.org/2000/svg';

/** Séries já lidas (ou `null` se a atividade não tem): cada atividade custa no máximo uma leitura. */
const cacheDeSeries = new Map();

function carregarSerie(id) {
  if (!cacheDeSeries.has(id)) {
    cacheDeSeries.set(
      id,
      lerSerieDetalhe(id).then(
        (s) => s ?? null,
        () => null,
      ),
    );
  }
  return cacheDeSeries.get(id);
}

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/** Trajeto projetado (equiretangular, corrigido pela latitude) dentro de um quadro `l × a`. Null sem pontos suficientes. */
function desenharTrajeto(lat, lon, l, a, pad = 22) {
  const pts = [];
  lat.forEach((la, i) => {
    if (Number.isFinite(la) && Number.isFinite(lon?.[i])) pts.push([lon[i], la]);
  });
  if (pts.length < 2) return null;
  const fator = Math.cos((pts[0][1] * Math.PI) / 180);
  const proj = pts.map(([x, y]) => [x * fator, -y]);
  const xs = proj.map((p) => p[0]);
  const ys = proj.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const larg = Math.max(...xs) - minX || 1e-9;
  const alt = Math.max(...ys) - minY || 1e-9;
  const escala = Math.min((l - pad * 2) / larg, (a - pad * 2) / alt);
  const dx = (l - larg * escala) / 2;
  const dy = (a - alt * escala) / 2;
  const final = proj.map(([x, y]) => [dx + (x - minX) * escala, dy + (y - minY) * escala]);
  return { d: final.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''), inicio: final[0], fim: final[final.length - 1] };
}

const LARGURA_MINI = 64;
const ALTURA_MINI = 48;

/** Miniatura 64×48: o traçado do percurso ou, sem GPS, a linha de elevação (ou de FC). Null sem dados. */
function miniaturaDaSerie(serie) {
  const raiz = svg('svg', { viewBox: `0 0 ${LARGURA_MINI} ${ALTURA_MINI}`, class: 'ativ-mini-svg', 'aria-hidden': 'true' });
  const trajeto = serie?.lat && serie?.lon ? desenharTrajeto(serie.lat, serie.lon, LARGURA_MINI, ALTURA_MINI, 8) : null;
  if (trajeto) {
    raiz.append(
      svg('path', { d: trajeto.d, class: 'ativ-mini-linha' }),
      svg('circle', { cx: trajeto.inicio[0], cy: trajeto.inicio[1], r: 2.6, class: 'ativ-mini-inicio' }),
    );
    return raiz;
  }
  const valores = serie?.alt?.filter(Number.isFinite).length > 2 ? serie.alt : serie?.fc?.filter(Number.isFinite).length > 2 ? serie.fc : null;
  if (!valores) return null;
  const validos = valores.filter(Number.isFinite);
  const min = Math.min(...validos);
  const faixa = Math.max(...validos) - min || 1;
  const passo = Math.max(1, Math.floor(valores.length / 40));
  const pontos = [];
  let ultimo = validos[0];
  for (let i = 0; i < valores.length; i += passo) {
    ultimo = Number.isFinite(valores[i]) ? valores[i] : ultimo;
    pontos.push([8 + (i / (valores.length - 1)) * (LARGURA_MINI - 16), ALTURA_MINI - 8 - ((ultimo - min) / faixa) * (ALTURA_MINI - 16)]);
  }
  raiz.append(
    svg('path', { d: pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''), class: 'ativ-mini-linha' }),
    svg('circle', { cx: pontos[0][0], cy: pontos[0][1], r: 2.6, class: 'ativ-mini-inicio' }),
  );
  return raiz;
}

/** Perfil de elevação como marca d'água (área e linha, esticado ao espaço): null sem altimetria. */
function marcaDeAltimetria(serie) {
  const validos = serie?.alt?.filter(Number.isFinite) ?? [];
  if (validos.length <= 2) return null;
  const min = Math.min(...validos);
  const faixa = Math.max(...validos) - min || 1;
  const l = 240;
  const a = 60;
  const passo = Math.max(1, Math.floor(serie.alt.length / 80));
  let ultimo = validos[0];
  const pontos = [];
  for (let i = 0; i < serie.alt.length; i += passo) {
    ultimo = Number.isFinite(serie.alt[i]) ? serie.alt[i] : ultimo;
    pontos.push([(i / (serie.alt.length - 1)) * l, a - 4 - ((ultimo - min) / faixa) * (a - 14)]);
  }
  const linha = pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return svg(
    'svg',
    { viewBox: `0 0 ${l} ${a}`, preserveAspectRatio: 'none', class: 'ativ-marca-svg', 'aria-hidden': 'true' },
    svg('path', { d: `${linha}L${l} ${a}L0 ${a}Z`, class: 'ativ-marca-area' }),
    svg('path', { d: linha, class: 'ativ-marca-linha' }),
  );
}

/**
 * Miniaturas da lista. Cada uma nasce com o ícone do esporte e só lê a série da atividade quando entra na tela
 * (o cache é o mesmo da prévia). `reiniciar` solta as miniaturas antigas antes de desenhar a página de novo.
 * `marca` devolve a altimetria da atividade como marca d'água (o mesmo cache de séries, então não lê nada a mais).
 * @returns {{ criar: (a: object) => HTMLElement, marca: (a: object) => HTMLElement, reiniciar: () => void }}
 */
export function criarMiniaturas({ iconeDoEsporte }) {
  const carregadores = new WeakMap();
  const observador =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entradas) =>
            entradas.forEach((e) => {
              if (!e.isIntersecting) return;
              observador.unobserve(e.target);
              carregadores.get(e.target)?.();
            }),
          { rootMargin: '240px' },
        );
  /** Lê a série quando o elemento entra na tela (ou já, sem IntersectionObserver). */
  function quandoVisivel(el, carregar) {
    if (observador) {
      carregadores.set(el, carregar);
      observador.observe(el);
    } else {
      carregar();
    }
  }
  return {
    criar(a) {
      const el = h('div', { class: 'ativ-mini', 'aria-hidden': 'true' }, iconeDoEsporte(a.esporte));
      // atividade manual não tem série: fica com o ícone
      if (a.origem === 'manual') return el;
      quandoVisivel(el, async () => {
        const desenho = miniaturaDaSerie(await carregarSerie(a.id));
        if (desenho) el.replaceChildren(desenho);
      });
      return el;
    },
    marca(a) {
      const el = h('div', { class: 'ativ-marca', 'aria-hidden': 'true' });
      if (a.origem === 'manual') return el;
      quandoVisivel(el, async () => {
        const desenho = marcaDeAltimetria(await carregarSerie(a.id));
        if (desenho) el.append(desenho);
      });
      return el;
    },
    reiniciar() {
      observador?.disconnect();
    },
  };
}
