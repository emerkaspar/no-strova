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
function desenharTrajeto(lat, lon, l, a) {
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
  const pad = 22;
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

  function posicionar(linha, mouseX) {
    const r = linha.getBoundingClientRect();
    const alturaPrevia = el.offsetHeight;
    const x = Math.min(Math.max(MARGEM, mouseX + 20), window.innerWidth - LARGURA - MARGEM);
    const abaixo = r.bottom + 10;
    const cabeAbaixo = abaixo + alturaPrevia <= window.innerHeight - MARGEM;
    const y = cabeAbaixo ? abaixo : Math.max(MARGEM, r.top - alturaPrevia - 10);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
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
      h('footer', { class: 'previa-rodape' }, icone('olho', 14), 'Clique no olho para abrir a atividade'),
    ];
  }

  async function mostrar(linha, a, mouseX) {
    atual = a.id;
    el.replaceChildren(...conteudo(a, null));
    el.classList.add('carregando');
    el.hidden = false;
    posicionar(linha, mouseX);
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
    posicionar(linha, mouseX);
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
      linha.addEventListener('mouseenter', (e) => {
        clearTimeout(temporizador);
        const x = e.clientX;
        temporizador = setTimeout(() => mostrar(linha, a, x), ATRASO_MS);
      });
      linha.addEventListener('mousemove', (e) => {
        if (atual === a.id && !el.hidden) posicionar(linha, e.clientX);
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
