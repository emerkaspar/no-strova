import { lerSerieDetalhe } from '../../infrastructure/atividadesRepo.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from './textos.js';

const NS = 'http://www.w3.org/2000/svg';
const ATRASO_MS = 280;
const LARGURA = 380;
const MARGEM = 14;

/** Séries já lidas (ou `null` se a atividade não tem): cada passada do mouse custa no máximo uma leitura. */
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

function quadroDoTrajeto(serie) {
  const l = LARGURA - 2;
  const a = 150;
  const trajeto = serie?.lat && serie?.lon ? desenharTrajeto(serie.lat, serie.lon, l, a) : null;
  if (!trajeto) return null;
  const raiz = svg('svg', { viewBox: `0 0 ${l} ${a}`, class: 'previa-trajeto', role: 'img', 'aria-label': 'Traçado do percurso' });
  raiz.append(
    svg('defs', {}, svg('linearGradient', { id: 'previa-grad', x1: 0, y1: 0, x2: 1, y2: 0 }, svg('stop', { offset: '0%', 'stop-color': 'var(--success)' }), svg('stop', { offset: '55%', 'stop-color': 'var(--primary)' }), svg('stop', { offset: '100%', 'stop-color': 'var(--danger)' }))),
    svg('path', { d: trajeto.d, class: 'previa-trajeto-sombra' }),
    svg('path', { d: trajeto.d, class: 'previa-trajeto-linha', stroke: 'url(#previa-grad)' }),
    svg('circle', { cx: trajeto.inicio[0], cy: trajeto.inicio[1], r: 5, class: 'previa-ponto previa-ponto-inicio' }),
    svg('circle', { cx: trajeto.fim[0], cy: trajeto.fim[1], r: 5, class: 'previa-ponto previa-ponto-fim' }),
  );
  return raiz;
}

/** Perfil de elevação (área) ou, sem altimetria, da FC. Null sem série. */
function perfil(serie) {
  const base = serie?.alt?.filter(Number.isFinite).length > 2 ? { v: serie.alt, cls: 'alt', rotulo: 'Elevação' } : serie?.fc?.filter(Number.isFinite).length > 2 ? { v: serie.fc, cls: 'fc', rotulo: 'Frequência cardíaca' } : null;
  if (!base) return null;
  const valores = base.v.map((x) => (Number.isFinite(x) ? x : null));
  const validos = valores.filter((x) => x !== null);
  const min = Math.min(...validos);
  const max = Math.max(...validos);
  const l = LARGURA - 2;
  const a = 52;
  const faixa = max - min || 1;
  let ultimo = validos[0];
  const pontos = valores.map((x, i) => {
    ultimo = x ?? ultimo;
    return [(i / (valores.length - 1)) * l, a - 4 - ((ultimo - min) / faixa) * (a - 10)];
  });
  const linha = pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const el = svg('svg', { viewBox: `0 0 ${l} ${a}`, class: `previa-perfil previa-perfil-${base.cls}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': base.rotulo });
  el.append(svg('path', { d: `${linha}L${l} ${a}L0 ${a}Z`, class: 'previa-perfil-area' }), svg('path', { d: linha, class: 'previa-perfil-linha' }));
  return el;
}

const metros = (m) => (Number.isFinite(m) && m > 0 ? `${formatarNumero(m, 0)} m` : '—');

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

/**
 * Miniaturas da lista. Cada uma nasce com o ícone do esporte e só lê a série da atividade quando entra na tela
 * (o cache é o mesmo da prévia). `reiniciar` solta as miniaturas antigas antes de desenhar a página de novo.
 * @returns {{ criar: (a: object) => HTMLElement, reiniciar: () => void }}
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
  return {
    criar(a) {
      const el = h('div', { class: 'ativ-mini', 'aria-hidden': 'true' }, iconeDoEsporte(a.esporte));
      // atividade manual não tem série: fica com o ícone
      if (a.origem === 'manual') return el;
      const carregar = async () => {
        const desenho = miniaturaDaSerie(await carregarSerie(a.id));
        if (desenho) el.replaceChildren(desenho);
      };
      if (observador) {
        carregadores.set(el, carregar);
        observador.observe(el);
      } else {
        carregar();
      }
      return el;
    },
    reiniciar() {
      observador?.disconnect();
    },
  };
}

function dado(rotulo, valor) {
  return h('div', { class: 'previa-dado' }, h('span', null, rotulo), h('strong', null, valor));
}

/**
 * Prévia flutuante da atividade ao passar o mouse na linha da lista: cabeçalho, traçado do percurso, perfil e principais números.
 * Só aparece com ponteiro que faz hover (no toque o olho abre a atividade direto).
 *
 * @param {{ textoVelocidade: (a: object) => string, iconeDoEsporte: (e: string) => Element }} apoio
 * @returns {{ ligar: (linha: HTMLElement, a: object) => void, destruir: () => void }}
 */
export function criarPrevia({ textoVelocidade, iconeDoEsporte }) {
  const el = h('div', { class: 'previa', role: 'tooltip', hidden: true });
  document.body.append(el);
  const podeHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  let temporizador = null;
  let atual = null; // id da atividade mostrada

  /** Ao lado da lista (alinhada à linha), para não cobrir as outras atividades; sem espaço, abaixo (ou acima) da linha. */
  function posicionar(linha) {
    const r = linha.getBoundingClientRect();
    const alturaPrevia = el.offsetHeight;
    const lista = linha.closest('.ativ-lista')?.getBoundingClientRect() ?? r;
    const aoLado = lista.right + 12 + LARGURA + MARGEM <= window.innerWidth;
    if (aoLado) {
      el.style.left = `${lista.right + 12}px`;
      el.style.top = `${Math.min(Math.max(MARGEM, r.top), Math.max(MARGEM, window.innerHeight - alturaPrevia - MARGEM))}px`;
      return;
    }
    const abaixo = r.bottom + 10;
    const cabeAbaixo = abaixo + alturaPrevia <= window.innerHeight - MARGEM;
    el.style.left = `${Math.min(Math.max(MARGEM, r.left), window.innerWidth - LARGURA - MARGEM)}px`;
    el.style.top = `${cabeAbaixo ? abaixo : Math.max(MARGEM, r.top - alturaPrevia - 10)}px`;
  }

  function conteudo(a, serie) {
    const trajeto = quadroDoTrajeto(serie);
    const graf = perfil(serie);
    const semMapa = h('div', { class: 'previa-vazio' }, iconeDoEsporte(a.esporte), h('span', null, a.origem === 'manual' ? 'Cadastro manual: sem traçado de percurso' : 'Sem traçado de percurso nesta atividade'));
    return [
      h(
        'header',
        { class: 'previa-topo' },
        h('span', { class: 'previa-esporte' }, icone(a.esporte === 'ciclismo' || a.esporte === 'corrida' ? a.esporte : 'outro', 20)),
        h('div', null, h('strong', null, a.titulo || (ROTULO_ESPORTE[a.esporte] ?? a.esporte)), h('span', null, a.titulo ? `${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarData(a.data)}` : formatarData(a.data))),
        a.hrss != null ? h('span', { class: 'previa-hrss' }, icone('hrss', 14), `${formatarNumero(a.hrss, 0)} HRSS`) : null,
      ),
      h('div', { class: 'previa-quadro' }, trajeto ?? semMapa, graf ? h('div', { class: 'previa-perfil-wrap' }, graf) : null),
      h(
        'div',
        { class: 'previa-dados' },
        dado('Distância', formatarDistancia(a.distanciaM)),
        dado('Duração', formatarDuracao(a.duracaoS)),
        dado(a.esporte === 'corrida' ? 'Ritmo' : 'Vel. média', textoVelocidade(a)),
        dado('Elevação', metros(a.altimetriaM)),
        dado('FC média', a.fcMedia ? `${a.fcMedia} bpm` : '—'),
        dado('Calorias', a.calorias ? `${formatarNumero(a.calorias, 0)} kcal` : '—'),
      ),
      h('footer', { class: 'previa-rodape' }, icone('olho', 14), 'Clique na linha para abrir a atividade'),
    ];
  }

  async function mostrar(linha, a) {
    atual = a.id;
    el.replaceChildren(...conteudo(a, null));
    el.classList.add('carregando');
    el.hidden = false;
    posicionar(linha);
    requestAnimationFrame(() => el.classList.add('visivel'));
    // Só atividades de arquivo têm série; as manuais já mostram o resumo.
    if (a.origem === 'manual') {
      el.classList.remove('carregando');
      return;
    }
    const serie = await carregarSerie(a.id);
    if (atual !== a.id) return;
    el.replaceChildren(...conteudo(a, serie));
    el.classList.remove('carregando');
    posicionar(linha);
  }

  function esconder() {
    clearTimeout(temporizador);
    temporizador = null;
    atual = null;
    el.classList.remove('visivel');
    el.hidden = true;
  }

  return {
    ligar(linha, a) {
      if (!podeHover) return;
      linha.addEventListener('mouseenter', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => mostrar(linha, a), ATRASO_MS);
      });
      linha.addEventListener('mouseleave', esconder);
    },
    esconder,
    destruir() {
      esconder();
      el.remove();
    },
  };
}
