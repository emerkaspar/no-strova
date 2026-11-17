import { faixaDoSono, faixaDosPassos, formatarSono, SONO_IDEAL } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { caminhoSuave } from '../../utils/graficoAtividade.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 1100;
const MARGEM = Object.freeze({ esquerda: 52, direita: 76 }); // a margem direita guarda os rótulos da meta e da faixa ideal
const LARGURA = L - MARGEM.esquerda - MARGEM.direita;
const ALTURA_PAINEL = 84;
const ESPACO = 34; // entre painéis (cabe o título do painel de baixo)
const TOPO = 24;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_POR_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  for (const f of filhos) if (f !== null && f !== undefined) el.append(f);
  return el;
}

/** Teto "redondo" (1, 2, 5 × 10^n) que cobre o valor. */
function tetoRedondo(valor) {
  const bruto = Math.max(valor, 1);
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 5, 10]) if (m * potencia >= bruto) return m * potencia;
  return potencia * 10;
}

/** Linha suave que se interrompe onde não há dado (`pontos`: [x, y] ou null). */
function linha(pontos) {
  const trechos = [];
  let atual = [];
  for (const p of pontos) {
    if (p === null) {
      if (atual.length) trechos.push(atual);
      atual = [];
    } else {
      atual.push(p);
    }
  }
  if (atual.length) trechos.push(atual);
  return trechos.map(caminhoSuave).join(' ');
}

/** Média móvel dos últimos 7 pontos (só dos que têm valor); null quando não há nenhum na janela. */
function mediaMovel7(valores) {
  return valores.map((_, i) => {
    const janela = valores.slice(Math.max(0, i - 6), i + 1).filter((v) => v !== null);
    return janela.length ? janela.reduce((s, v) => s + v, 0) / janela.length : null;
  });
}

const rotuloDoGrupo = (g, granularidade) => {
  if (granularidade === 'mes') {
    const [a, m] = g.inicio.split('-');
    return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
  }
  return formatarData(g.inicio).slice(0, 5);
};

const tituloDoGrupo = (g, granularidade) => {
  if (granularidade === 'dia') return formatarData(g.inicio);
  if (granularidade === 'mes') {
    const [a, m] = g.inicio.split('-');
    return `${MESES_POR_EXTENSO[Number(m) - 1]} de ${a}${g.parcial ? ' (em andamento)' : ''}`;
  }
  return `${formatarData(g.inicio).slice(0, 5)} a ${formatarData(g.fim).slice(0, 5)}${g.parcial ? ' (em andamento)' : ''}`;
};

const TEXTO_FAIXA_SONO = Object.freeze({ ideal: 'ideal', curto: 'curto', 'muito-curto': 'muito curto', longo: 'longo' });
const TEXTO_FAIXA_PASSOS = Object.freeze({ atingiu: 'meta atingida', quase: 'quase na meta', abaixo: 'abaixo da meta' });

/**
 * Sono, passos e carga de treino no mesmo eixo de tempo: três painéis empilhados com barras (a cor mostra a faixa do sono e se
 * a meta de passos foi atingida), a meta e a faixa ideal ao fundo e, no modo diário, a média de 7 dias. Um ponto por dia (até
 * 90 dias), semana (até 6 meses) ou mês. Passar o mouse (ou tocar) abre o detalhe do dia.
 * @param {{ grupos: ReturnType<typeof import('@no-strova/domain').agruparTreinoECorpo>['grupos'], granularidade: 'dia'|'semana'|'mes', metaPassos: number }} p
 * @returns {HTMLElement|null} null sem nenhum dado de sono, passos ou carga
 */
export function criarGraficoSaude({ grupos, granularidade, metaPassos }) {
  const n = grupos.length;
  if (n < 2) return null;
  const tem = {
    carga: grupos.some((g) => g.cargaHrss > 0),
    sono: grupos.some((g) => g.sonoMedioS !== null),
    passos: grupos.some((g) => g.passosMedio !== null),
  };
  const painelIds = ['sono', 'passos', 'carga'].filter((id) => tem[id]);
  if (painelIds.length === 0) return null;

  const passoX = LARGURA / n;
  const px = (i) => MARGEM.esquerda + (i + 0.5) * passoX;
  const larguraBarra = Math.max(2, Math.min(passoX * 0.62, 24));
  const topoDe = (idx) => TOPO + idx * (ALTURA_PAINEL + ESPACO);
  const fimDosPaineis = topoDe(painelIds.length - 1) + ALTURA_PAINEL;
  const EIXO_X = fimDosPaineis + 22;
  const ALTURA = EIXO_X + 12;
  const comMedia = granularidade === 'dia'; // a média de 7 dias só faz sentido com um ponto por dia

  const filhos = [];
  const destaque = svg('rect', { class: 'gps-hover', x: 0, y: TOPO - 8, width: passoX, height: fimDosPaineis - TOPO + 16, rx: 4, visibility: 'hidden' });
  filhos.push(destaque);

  /** Um painel: título, escala vertical (dois rótulos), grade e o que `desenhar` pintar dentro. */
  function painel(id, titulo, { minimo, maximo, rotulo }, desenhar) {
    const idx = painelIds.indexOf(id);
    const topo = topoDe(idx);
    const y = (v) => topo + ALTURA_PAINEL * (1 - (v - minimo) / (maximo - minimo || 1));
    filhos.push(svg('text', { class: 'cg-titulo-painel', x: MARGEM.esquerda, y: topo - 10 }, titulo));
    for (const v of [minimo, maximo]) {
      filhos.push(
        svg('line', { class: 'cg-grade', x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: y(v), y2: y(v) }),
        svg('text', { class: 'cg-rotulo', x: MARGEM.esquerda - 8, y: y(v) + 4, 'text-anchor': 'end' }, rotulo(v)),
      );
    }
    desenhar(y);
  }

  const barras = (valorDe, y, classeDe) =>
    grupos.forEach((g, i) => {
      const v = valorDe(g);
      if (v === null || !(v > 0)) return;
      filhos.push(svg('rect', { class: `gps-barra ${classeDe(v)}${g.parcial ? ' gtc-parcial' : ''}`, x: px(i) - larguraBarra / 2, y: y(v), width: larguraBarra, height: Math.max(1, y(0) - y(v)), rx: 2 }));
    });
  const mediaEm = (valores, y) => {
    if (!comMedia) return;
    const m = mediaMovel7(valores);
    filhos.push(svg('path', { class: 'gps-media', d: linha(m.map((v, i) => (v === null ? null : [px(i), y(v)]))) }));
  };

  if (tem.sono) {
    const valores = grupos.map((g) => g.sonoMedioS);
    const maximo = Math.ceil(Math.max(SONO_IDEAL.maxS + 3600, ...valores.filter((v) => v !== null)) / 3600 / 2) * 2 * 3600;
    painel('sono', granularidade === 'dia' ? 'SONO POR NOITE' : 'SONO MÉDIO POR NOITE', { minimo: 0, maximo, rotulo: (v) => `${Math.round(v / 3600)} h` }, (y) => {
      filhos.push(svg('rect', { class: 'gps-faixa-sono', x: MARGEM.esquerda, y: y(SONO_IDEAL.maxS), width: LARGURA, height: y(SONO_IDEAL.minS) - y(SONO_IDEAL.maxS) }));
      filhos.push(svg('text', { class: 'gps-meta-rotulo gps-faixa-rotulo', x: L - MARGEM.direita + 8, y: (y(SONO_IDEAL.maxS) + y(SONO_IDEAL.minS)) / 2 + 4 }, 'ideal 7 a 9 h'));
      barras((g) => g.sonoMedioS, y, (v) => `gps-sono-${faixaDoSono(v)}`);
      mediaEm(valores, y);
    });
  }

  if (tem.passos) {
    const valores = grupos.map((g) => g.passosMedio);
    const maximo = Math.ceil(Math.max(metaPassos * 1.15, ...valores.filter((v) => v !== null)) / 4000) * 4000;
    painel('passos', granularidade === 'dia' ? 'PASSOS POR DIA' : 'PASSOS POR DIA (MÉDIA)', { minimo: 0, maximo, rotulo: (v) => (v >= 1000 ? `${formatarNumero(v / 1000, 0)} mil` : '0') }, (y) => {
      barras((g) => g.passosMedio, y, (v) => `gps-passos-${faixaDosPassos(v, metaPassos)}`);
      filhos.push(svg('line', { class: 'gps-meta', x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: y(metaPassos), y2: y(metaPassos) }));
      filhos.push(svg('text', { class: 'gps-meta-rotulo', x: L - MARGEM.direita + 8, y: y(metaPassos) + 4 }, `meta ${formatarNumero(metaPassos, 0)}`));
      mediaEm(valores, y);
    });
  }

  if (tem.carga) {
    const maximo = tetoRedondo(Math.max(...grupos.map((g) => g.cargaHrss)) * 1.05);
    painel('carga', granularidade === 'mes' ? 'CARGA DE TREINO NO MÊS (HRSS)' : granularidade === 'semana' ? 'CARGA DE TREINO NA SEMANA (HRSS)' : 'CARGA DE TREINO NO DIA (HRSS)', { minimo: 0, maximo, rotulo: (v) => formatarNumero(v, 0) }, (y) => {
      barras((g) => g.cargaHrss, y, () => 'gtc-carga');
    });
  }

  // eixo de datas: cerca de 8 rótulos, sempre incluindo o último grupo
  const salto = Math.max(1, Math.ceil(n / 8));
  for (let i = n - 1; i >= 0; i -= salto) {
    filhos.push(svg('text', { class: 'cg-rotulo', x: px(i), y: EIXO_X, 'text-anchor': 'middle' }, rotuloDoGrupo(grupos[i], granularidade)));
  }
  const guia = svg('line', { class: 'cg-guia', x1: 0, x2: 0, y1: TOPO - 8, y2: fimDosPaineis + 8, visibility: 'hidden' });
  filhos.push(guia);

  const nomes = { sono: 'sono', passos: 'passos', carga: 'carga de treino' };
  const resumo = `Sono, passos e carga de treino por ${granularidade === 'dia' ? 'dia' : granularidade === 'semana' ? 'semana' : 'mês'}: ${painelIds.map((id) => nomes[id]).join(', ')}, de ${tituloDoGrupo(grupos[0], granularidade)} a ${tituloDoGrupo(grupos[n - 1], granularidade)}.`;
  const raizSvg = svg('svg', { class: 'cg-svg', viewBox: `0 0 ${L} ${ALTURA}`, role: 'img', 'aria-label': resumo }, ...filhos);
  const dica = h('div', { class: 'cg-dica', role: 'status', hidden: true });
  const area = h('div', { class: 'cg-area-grafico' }, raizSvg, dica);
  const linhaDica = (rotulo, valor, classe) => h('div', { class: `cg-dica-linha ${classe}` }, h('span', null, rotulo), h('strong', null, valor));

  function destacar(i) {
    const g = grupos[i];
    guia.setAttribute('x1', px(i));
    guia.setAttribute('x2', px(i));
    guia.setAttribute('visibility', 'visible');
    destaque.setAttribute('x', px(i) - passoX / 2);
    destaque.setAttribute('visibility', 'visible');
    const fs = g.sonoMedioS === null ? null : faixaDoSono(g.sonoMedioS);
    const fp = g.passosMedio === null ? null : faixaDosPassos(g.passosMedio, metaPassos);
    dica.replaceChildren(
      ...[
        h('p', { class: 'cg-dica-topo' }, tituloDoGrupo(g, granularidade)),
        tem.sono ? linhaDica(granularidade === 'dia' ? 'Sono' : 'Sono por noite', g.sonoMedioS === null ? 'sem registro' : `${formatarSono(g.sonoMedioS)} · ${TEXTO_FAIXA_SONO[fs]}`, 'gps-dica-sono') : null,
        tem.passos ? linhaDica(granularidade === 'dia' ? 'Passos' : 'Passos por dia', g.passosMedio === null ? 'sem registro' : `${formatarNumero(g.passosMedio, 0)} · ${TEXTO_FAIXA_PASSOS[fp]}`, 'gps-dica-passos') : null,
        tem.carga ? linhaDica('Carga (HRSS)', g.cargaHrss > 0 ? formatarNumero(g.cargaHrss, 0) : 'sem treino', 'gtc-dica-carga') : null,
      ].filter(Boolean),
    );
    dica.hidden = false;
    const pct = (px(i) / L) * 100;
    dica.style.left = `${pct}%`;
    dica.classList.toggle('cg-dica-esquerda', pct > 65);
  }

  function limpar() {
    guia.setAttribute('visibility', 'hidden');
    destaque.setAttribute('visibility', 'hidden');
    dica.hidden = true;
  }

  const indiceDoPonteiro = (e) => {
    const caixa = raizSvg.getBoundingClientRect();
    const xSvg = ((e.clientX - caixa.left) / (caixa.width || 1)) * L;
    return Math.min(n - 1, Math.max(0, Math.floor((xSvg - MARGEM.esquerda) / passoX)));
  };
  area.addEventListener('pointermove', (e) => destacar(indiceDoPonteiro(e)));
  area.addEventListener('pointerdown', (e) => destacar(indiceDoPonteiro(e)));
  area.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') limpar();
  });
  return area;
}
