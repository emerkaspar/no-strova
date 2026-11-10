const NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 130;
const ML = 12;
const MR = 12;
const MT = 12;
const MB = 24;
const INTERVALO_MINIMO_KM = 0.05;

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

let contador = 0;
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const kmTexto = (km) => `${(Math.round(km * 100) / 100).toString().replace('.', ',')} km`;

/**
 * Gráfico de corte, como o de "recortar atividade" do Strava e do Garmin: o perfil de elevação da atividade inteira, com duas
 * alças (início e fim) que se arrastam ao longo da distância. A parte entre as alças fica colorida. Funciona também pelo teclado
 * (setas; Shift anda mais rápido). Quando a atividade não tem altimetria, desenha só uma faixa.
 * @param {{ dKm: Array<number|null>, alt?: Array<number|null>|null, totalKm: number, aoMudar: (f: { iniKm: number, fimKm: number }) => void }} p
 * @returns {{ el: SVGElement, definir: (iniKm: number, fimKm: number) => void }}
 */
export function seletorDeFaixa({ dKm, alt = null, totalKm, aoMudar }) {
  const total = totalKm > 0 ? totalKm : 1;
  const indices = [];
  dKm.forEach((d, i) => {
    if (Number.isFinite(d)) indices.push(i);
  });
  const salto = Math.max(1, Math.ceil(indices.length / 320));
  const amostra = indices
    .filter((_, k) => k % salto === 0 || k === indices.length - 1)
    .map((i) => ({ d: dKm[i], a: Number.isFinite(alt?.[i]) ? alt[i] : 0 }));
  const altMin = Math.min(...amostra.map((p) => p.a));
  const altMax = Math.max(...amostra.map((p) => p.a));
  const amplitude = Math.max(altMax - altMin, 10);
  const x = (km) => ML + (km / total) * (W - ML - MR);
  const y = (a) => MT + (1 - (a - altMin) / amplitude) * (H - MT - MB);
  const base = H - MB;

  const raiz = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'traj-corte',
    role: 'group',
    'aria-label': 'Gráfico de corte do trajeto: arraste as alças de início e fim ao longo da atividade',
  });

  const id = `traj-corte-${++contador}`;
  const linhaTopo = amostra.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.d).toFixed(1)},${y(p.a).toFixed(1)}`).join(' ');
  const area = `${linhaTopo} L${x(amostra[amostra.length - 1].d).toFixed(1)},${base} L${x(amostra[0].d).toFixed(1)},${base} Z`;
  const recorte = svg('rect', { y: 0, height: H });
  raiz.append(svg('defs', {}, svg('clipPath', { id }, recorte)));
  raiz.append(svg('path', { d: area, class: 'traj-corte-area' }));
  raiz.append(svg('path', { d: area, class: 'traj-corte-area-sel', 'clip-path': `url(#${id})` }));
  raiz.append(svg('path', { d: linhaTopo, class: 'traj-corte-linha', fill: 'none' }));
  raiz.append(svg('line', { x1: ML, y1: base, x2: W - MR, y2: base, class: 'traj-corte-eixo' }));
  const rotulo = (texto, tx, ancora) => svg('text', { x: tx, y: H - 6, 'text-anchor': ancora, class: 'traj-corte-rotulo' }, texto);
  raiz.append(rotulo('0', ML, 'start'), rotulo(kmTexto(total), W - MR, 'end'));

  let ini = 0;
  let fim = total;

  const alca = (classe, nome) => {
    const g = svg('g', { class: `traj-corte-alca ${classe}`, tabindex: 0, role: 'slider', 'aria-label': nome, 'aria-valuemin': 0, 'aria-valuemax': total.toFixed(2) });
    const haste = svg('line', { y1: MT - 4, y2: base });
    const bola = svg('circle', { cy: MT + 4, r: 9 });
    const toque = svg('rect', { y: 0, width: 28, height: H - MB + 6, fill: 'transparent' }); // área de toque larga
    g.append(toque, haste, bola);
    return { g, haste, bola, toque };
  };
  const aIni = alca('traj-corte-ini', 'Início do trajeto');
  const aFim = alca('traj-corte-fim', 'Fim do trajeto');
  raiz.append(aIni.g, aFim.g);

  function desenhar() {
    recorte.setAttribute('x', x(ini).toFixed(1));
    recorte.setAttribute('width', Math.max(0, x(fim) - x(ini)).toFixed(1));
    for (const [a, km] of [[aIni, ini], [aFim, fim]]) {
      const px = x(km).toFixed(1);
      a.haste.setAttribute('x1', px);
      a.haste.setAttribute('x2', px);
      a.bola.setAttribute('cx', px);
      a.toque.setAttribute('x', (x(km) - 14).toFixed(1));
      a.g.setAttribute('aria-valuenow', km.toFixed(2));
      a.g.setAttribute('aria-valuetext', kmTexto(km));
    }
  }

  function mover(qual, km) {
    if (qual === 'ini') ini = limitar(km, 0, Math.max(0, fim - INTERVALO_MINIMO_KM));
    else fim = limitar(km, Math.min(total, ini + INTERVALO_MINIMO_KM), total);
    desenhar();
    aoMudar({ iniKm: ini, fimKm: fim });
  }

  const kmDoPonteiro = (e) => {
    const r = raiz.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return limitar(((px - ML) / (W - ML - MR)) * total, 0, total);
  };

  for (const [qual, a] of [['ini', aIni], ['fim', aFim]]) {
    a.g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      a.g.setPointerCapture(e.pointerId);
      a.g.focus();
      a.g.classList.add('arrastando');
    });
    a.g.addEventListener('pointermove', (e) => {
      if (a.g.hasPointerCapture(e.pointerId)) mover(qual, kmDoPonteiro(e));
    });
    const soltar = (e) => {
      if (a.g.hasPointerCapture(e.pointerId)) a.g.releasePointerCapture(e.pointerId);
      a.g.classList.remove('arrastando');
    };
    a.g.addEventListener('pointerup', soltar);
    a.g.addEventListener('pointercancel', soltar);
    a.g.addEventListener('keydown', (e) => {
      const passo = (e.shiftKey ? 10 : 1) * Math.max(0.01, total / 500);
      const atual = qual === 'ini' ? ini : fim;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') mover(qual, atual - passo);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') mover(qual, atual + passo);
      else if (e.key === 'Home') mover(qual, 0);
      else if (e.key === 'End') mover(qual, total);
      else return;
      e.preventDefault();
    });
  }

  desenhar();
  return {
    el: raiz,
    /** Posiciona as alças sem avisar `aoMudar`. */
    definir(iniKm, fimKm) {
      ini = limitar(iniKm, 0, total);
      fim = limitar(fimKm, ini, total);
      desenhar();
    },
  };
}
