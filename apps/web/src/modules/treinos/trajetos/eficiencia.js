import { compararInicioRecente, tendenciaLinear } from '@no-strova/domain';
import { h } from '../../../utils/dom.js';
import { passoDoEixo } from '../../../utils/graficoLinha.js';
import { formatarData, formatarNumero } from '../../../utils/formatters.js';
import { textoDeVariacao } from './textos.js';

const NS = 'http://www.w3.org/2000/svg';
const A = 270;
const M = { topo: 26, direita: 12, base: 26, esquerda: 42 };

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos ?? {})) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

const dia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
};
const isoDoDia = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
const num = (v, casas = 2) => formatarNumero(v, casas);
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const diferenca = (v, casas = 2) => (Number.isFinite(v) ? `${sinal(v)}${num(Math.abs(v), casas)}` : '—');
const pct = (de, para) => (Number.isFinite(de) && Number.isFinite(para) && de !== 0 ? ((para - de) / Math.abs(de)) * 100 : null);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Classe de tom: melhor (verde), pior (vermelho) ou neutro; `menorEMelhor` inverte o sentido (FC). */
function tom(delta, menorEMelhor = false, limite = 0.5) {
  if (!Number.isFinite(delta) || Math.abs(delta) < limite) return 'neutro';
  return (delta > 0) !== menorEMelhor ? 'melhor' : 'pior';
}

function faixaY(valores) {
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 0.08) {
    const meio = (min + max) / 2;
    min = meio - 0.04;
    max = meio + 0.04;
  }
  const folga = (max - min) * 0.22;
  return { min: min - folga, max: max + folga };
}

/** Leitura em português do que mudou, a partir das médias do início e do recente. */
function leitura(ir) {
  const e = pct(ir.eficienciaInicio, ir.eficienciaRecente);
  const v = pct(ir.velocidadeInicio, ir.velocidadeRecente);
  const fc = pct(ir.fcInicio, ir.fcRecente);
  let titulo;
  let texto;
  if (e === null) return { titulo: 'Sem base para comparar', texto: 'Faltam passagens com frequência cardíaca no início e no fim.', tom: 'neutro' };
  if (e >= 1) {
    titulo = 'Condicionamento melhorou';
    texto = 'Você percorre mais metros por batimento do que no início.';
    if (fc !== null && v !== null) {
      if (fc <= -1 && v <= 0.5) texto += ' O ganho vem de um coração mais tranquilo: a FC caiu enquanto a velocidade ficou parecida.';
      else if (v >= 1 && fc >= 1) texto += ' Você está indo mais rápido e aceitando uma FC maior, com saldo positivo.';
      else if (v >= 1) texto += ' Você está mais rápido sem gastar mais batimentos.';
    }
  } else if (e <= -1) {
    titulo = 'Eficiência abaixo do início';
    texto = 'Mais batimentos para cada metro percorrido. Calor, vento, cansaço ou pausa nos treinos costumam explicar; confira o contexto das passagens.';
    if (fc !== null && v !== null && fc >= 1 && v <= 0.5) texto = 'A FC subiu sem ganho de velocidade. Calor, vento, cansaço ou pausa nos treinos costumam explicar; confira o contexto das passagens.';
    else if (fc !== null && v !== null && v <= -1 && fc <= 0.5) texto = 'Você está mais lento para uma FC parecida. Calor, vento, cansaço ou pausa nos treinos costumam explicar; confira o contexto das passagens.';
  } else {
    titulo = 'Eficiência estável';
    texto = 'Praticamente o mesmo rendimento por batimento do início até agora.';
  }
  return { titulo, texto, tom: tom(e, false, 1) };
}

function linhaDeComparacao(rotulo, inicio, recente, { casas, unidade, menorEMelhor = false, dica }) {
  const delta = pct(inicio, recente);
  const abs = Number.isFinite(inicio) && Number.isFinite(recente) ? recente - inicio : null;
  return h(
    'div',
    { class: 'ef-linha' },
    h('div', { class: 'ef-linha-rotulo' }, h('span', null, rotulo), dica ? h('small', { class: 'texto-secundario' }, dica) : null),
    h(
      'div',
      { class: 'ef-linha-valores' },
      h('span', { class: 'ef-valor-inicio' }, `${num(inicio, casas)}${unidade}`),
      h('span', { class: 'ef-seta', 'aria-hidden': 'true' }, '→'),
      h('strong', { class: 'ef-valor-recente' }, `${num(recente, casas)}${unidade}`),
    ),
    h(
      'div',
      { class: `ef-delta ef-delta-${tom(delta, menorEMelhor)}` },
      h('strong', null, textoDeVariacao(delta, 1)),
      h('small', null, abs === null ? '' : `${diferenca(abs, casas)}${unidade}`),
    ),
  );
}

/**
 * Gráfico principal do trajeto: eficiência aeróbica (metros por minuto para cada batimento) de cada passagem, com as
 * faixas do início e do recente e as médias de cada uma, mais o comparativo de eficiência, velocidade e FC.
 *
 * @param {object} p
 * @param {Array<object>} p.passagens passagens visíveis, em ordem de data
 * @param {Set<string>} p.selecionadas ids selecionados para comparar
 * @param {Map<string, string[]>} p.contexto id → fatores (rótulos) que podem explicar a passagem
 * @param {(id: string) => void} p.aoAlternar
 * @param {null | { de: string, ate: string }} p.periodo recorte escolhido arrastando no gráfico (datas ISO); null = todas as passagens
 * @param {(periodo: null | { de: string, ate: string }) => void} p.aoMudarPeriodo
 */
export function criarCartaoEficiencia({ passagens, selecionadas, contexto, aoAlternar, periodo = null, aoMudarPeriodo = () => {} }) {
  const comFc = passagens.filter((p) => Number.isFinite(p.eficiencia));
  const semFc = passagens.length - comFc.length;
  const base = periodo ? comFc.filter((p) => p.data >= periodo.de && p.data <= periodo.ate) : comFc;
  const ir = compararInicioRecente(base);

  const cabecalho = h(
    'div',
    { class: 'bloco-topo' },
    h('h2', null, 'Eficiência: início × recente'),
    periodo
      ? h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', onClick: () => aoMudarPeriodo(null) }, `Período: ${formatarData(periodo.de)} a ${formatarData(periodo.ate)} · limpar`)
      : null,
  );
  if (!compararInicioRecente(comFc)) {
    return h(
      'section',
      { class: 'card pilha ef-cartao' },
      cabecalho,
      h('p', { class: 'vazio-curto' }, 'Precisa de frequência cardíaca em ao menos 2 passagens para comparar o início com o recente.'),
    );
  }

  const idsInicio = new Set(ir?.idsInicio ?? []);
  const idsRecente = new Set(ir?.idsRecente ?? []);
  const ef = ir && ir.eficienciaInicio !== null && ir.eficienciaRecente !== null ? pct(ir.eficienciaInicio, ir.eficienciaRecente) : null;
  const lei = ir ? leitura(ir) : null;
  const tend = tendenciaLinear(base, (p) => p.eficiencia);
  const melhor = base.length ? base.reduce((a, b) => (b.eficiencia > a.eficiencia ? b : a)) : null;
  const ultima = base[base.length - 1];
  const dentro = new Set(base.map((p) => p.id));
  const noContexto = base.filter((p) => (idsInicio.has(p.id) || idsRecente.has(p.id)) && (contexto.get(p.id) ?? []).length > 0);

  // ---------- gráfico ----------
  const pontos = comFc.map((p) => ({ p, x: dia(p.data), y: p.eficiencia })).filter((q) => Number.isFinite(q.x));
  const xs = pontos.map((q) => q.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const intervalo = xMax - xMin || 1;
  const folgaX = Math.max(intervalo * 0.035, 0.6);
  const dica = document.createElement('div');
  dica.className = 'grafico-dica';
  dica.hidden = true;
  const altura = A - M.topo - M.base;
  const { min: yMin, max: yMax } = faixaY([...pontos.map((q) => q.y), ...(ir ? [ir.eficienciaInicio, ir.eficienciaRecente] : [])]);
  const py = (v) => M.topo + (1 - (v - yMin) / (yMax - yMin || 1)) * altura;
  const afastar = (p) => (p.totalVoltas > 1 ? (p.volta - 1 - (p.totalVoltas - 1) / 2) * 9 : 0);

  function desenhar(L) {
    const largura = L - M.esquerda - M.direita;
    const px = (v) => M.esquerda + (xMax === xMin ? 0.5 : (v - xMin) / intervalo) * largura;
    const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, width: L, height: A, class: 'ef-svg', role: 'group', 'aria-label': 'Eficiência aeróbica por passagem, com a média do início e a do recente' });

    const passoY = passoDoEixo(yMax - yMin, 4);
    for (let v = Math.ceil(yMin / passoY) * passoY; v <= yMax; v += passoY) {
      raiz.append(
        svg('line', { x1: M.esquerda, x2: L - M.direita, y1: py(v), y2: py(v), class: 'grafico-grade' }),
        svg('text', { x: M.esquerda - 8, y: py(v) + 4, 'text-anchor': 'end', class: 'ef-eixo' }, num(v, 2)),
      );
    }
    const passoX = Math.max(1, passoDoEixo(intervalo, Math.max(3, Math.floor(largura / 110))));
    for (let v = Math.ceil(xMin / passoX) * passoX; v <= xMax; v += passoX) {
      const [, mes, d] = isoDoDia(v).split('-');
      raiz.append(svg('text', { x: px(v), y: A - 8, 'text-anchor': 'middle', class: 'ef-eixo' }, `${d}/${mes}`));
    }

    const faixa = (ids, classe, rotulo, media) => {
      const dosIds = pontos.filter((q) => ids.has(q.p.id));
      const x1 = Math.max(M.esquerda, px(Math.min(...dosIds.map((q) => q.x)) - folgaX));
      const x2 = Math.min(L - M.direita, px(Math.max(...dosIds.map((q) => q.x)) + folgaX));
      raiz.append(
        svg('rect', { x: x1, y: M.topo - 8, width: Math.max(x2 - x1, 8), height: altura + 8, rx: 4, class: `ef-banda ${classe}` }),
        svg('text', { x: x1 + 6, y: M.topo + 4, class: `ef-banda-rotulo ${classe}` }, rotulo),
        svg('line', { x1, x2, y1: py(media), y2: py(media), class: `ef-media ${classe}` }),
      );
      return { x1, x2, y: py(media) };
    };
    if (periodo) {
      const x1 = Math.max(M.esquerda, px(dia(periodo.de)) - 2);
      const x2 = Math.min(L - M.direita, px(dia(periodo.ate)) + 2);
      raiz.append(svg('rect', { x: x1, y: M.topo - 8, width: Math.max(x2 - x1, 4), height: altura + 8, class: 'ef-periodo' }));
    }
    const fi = ir ? faixa(idsInicio, 'ef-inicio', 'INÍCIO', ir.eficienciaInicio) : null;
    const fr = ir ? faixa(idsRecente, 'ef-recente', 'RECENTE', ir.eficienciaRecente) : null;

    if (ir && fi.x2 + 30 < fr.x1) {
      raiz.append(svg('line', { x1: fi.x2, y1: fi.y, x2: fr.x1, y2: fr.y, class: `ef-ponte ef-ponte-${tom(ef, false, 1)}` }));
      if (ef !== null && fr.x1 - fi.x2 > 80) {
        raiz.append(svg('text', { x: (fi.x2 + fr.x1) / 2, y: (fi.y + fr.y) / 2 - 8, 'text-anchor': 'middle', class: `ef-ponte-texto ef-ponte-${tom(ef, false, 1)}` }, textoDeVariacao(ef, 1)));
      }
    }
    if (ir) {
      raiz.append(
        svg('text', { x: fi.x1 + 6, y: fi.y + 15, class: 'ef-media-valor ef-inicio' }, num(ir.eficienciaInicio)),
        svg('text', { x: fr.x2 - 6, y: fr.y + 15, 'text-anchor': 'end', class: 'ef-media-valor ef-recente' }, num(ir.eficienciaRecente)),
      );
    }

    // arrastar no gráfico escolhe o período
    const area = svg('rect', { x: M.esquerda, y: M.topo - 8, width: largura, height: altura + 8, class: 'ef-area' });
    const brush = svg('rect', { y: M.topo - 8, height: altura + 8, class: 'ef-brush', visibility: 'hidden' });
    let inicioX = null;
    const xLocal = (e) => {
      const caixa = raiz.getBoundingClientRect();
      return Math.max(M.esquerda, Math.min(L - M.direita, ((e.clientX - caixa.left) / (caixa.width || L)) * L));
    };
    const diaDe = (x) => xMin + ((x - M.esquerda) / largura) * intervalo;
    area.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      inicioX = xLocal(e);
      area.setPointerCapture?.(e.pointerId);
      brush.setAttribute('x', inicioX);
      brush.setAttribute('width', 0);
      brush.setAttribute('visibility', 'visible');
    });
    area.addEventListener('pointermove', (e) => {
      if (inicioX === null) return;
      const x = xLocal(e);
      brush.setAttribute('x', Math.min(inicioX, x));
      brush.setAttribute('width', Math.abs(x - inicioX));
    });
    const terminar = (e, cancelar = false) => {
      if (inicioX === null) return;
      const x = xLocal(e);
      const a = inicioX;
      inicioX = null;
      brush.setAttribute('visibility', 'hidden');
      if (cancelar || Math.abs(x - a) < 8) return;
      const de = isoDoDia(Math.floor(diaDe(Math.min(a, x))));
      const ate = isoDoDia(Math.ceil(diaDe(Math.max(a, x))));
      aoMudarPeriodo({ de, ate });
    };
    area.addEventListener('pointerup', (e) => terminar(e));
    area.addEventListener('pointercancel', (e) => terminar(e, true));
    raiz.append(area, brush);

    if (pontos.length >= 2) raiz.append(svg('polyline', { points: pontos.map((q) => `${(px(q.x) + afastar(q.p)).toFixed(1)},${py(q.y).toFixed(1)}`).join(' '), class: 'ef-linha-evolucao' }));
    if (tend && pontos.length >= 3) {
      raiz.append(svg('line', { x1: px(xMin), x2: px(xMax), y1: py(tend.valorEm(isoDoDia(xMin))), y2: py(tend.valorEm(isoDoDia(xMax))), class: 'traj-tendencia ef-tendencia' }));
    }

    for (const { p, x, y } of pontos) {
      const sel = selecionadas.has(p.id);
      const fatores = contexto.get(p.id) ?? [];
      const grupo = idsInicio.has(p.id) ? 'ef-ponto-inicio' : idsRecente.has(p.id) ? 'ef-ponto-recente' : periodo && !dentro.has(p.id) ? 'ef-ponto-meio ef-ponto-fora' : 'ef-ponto-meio';
      const classes = ['ef-ponto', grupo, fatores.length ? 'traj-ponto-contexto' : '', sel ? 'traj-ponto-sel' : ''].filter(Boolean).join(' ');
      const partes = [
        `${formatarData(p.data)}${p.totalVoltas > 1 ? ` (volta ${p.volta})` : ''}`,
        `eficiência ${num(y)}`,
        `${num(p.velocidadeKmh, 1)} km/h`,
        p.fcMedia !== null ? `${num(p.fcMedia, 0)} bpm` : null,
        fatores.length ? fatores.join(', ') : null,
      ].filter(Boolean);
      const ponto = svg('circle', {
        cx: (px(x) + afastar(p)).toFixed(1),
        cy: py(y).toFixed(1),
        r: sel ? 6 : 4.5,
        class: classes,
        tabindex: 0,
        role: 'button',
        'aria-pressed': String(sel),
        'aria-label': `${partes.join(' · ')}. ${sel ? 'Selecionada' : 'Selecionar'} para comparar.`,
      });
      const mostrar = () => {
        dica.textContent = partes.join(' · ');
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
  }

  const grafico = h('div', { class: 'grafico traj-grafico ef-grafico' }, dica);
  let larguraAtual = 0;
  const redesenhar = (largura) => {
    const L = Math.max(300, Math.round(largura));
    if (L === larguraAtual) return;
    larguraAtual = L;
    grafico.querySelector('svg')?.remove();
    grafico.prepend(desenhar(L));
  };
  redesenhar(640);
  if (typeof ResizeObserver !== 'undefined') {
    const obs = new ResizeObserver((entradas) => {
      if (!grafico.isConnected) return obs.disconnect();
      redesenhar(entradas[0].contentRect.width);
    });
    obs.observe(grafico);
  }

  // ---------- topo: veredito ----------
  const veredito = !ir ? h('p', { class: 'ef-aviso', role: 'note' }, 'Há menos de 2 passagens com FC neste período. Arraste uma faixa maior ou limpe o período.') : h(
    'div',
    { class: `ef-veredito ef-veredito-${lei.tom}` },
    h('div', { class: 'ef-veredito-numero' }, h('span', { class: 'cg-mini-rotulo' }, 'Variação da eficiência'), h('strong', null, textoDeVariacao(ef, 1)), h('small', null, `média das ${ir.n} primeiras contra as ${ir.n} últimas`)),
    h('div', { class: 'ef-veredito-texto' }, h('strong', null, lei.titulo), h('p', { class: 'texto-secundario' }, lei.texto)),
  );

  // ---------- comparativo ----------
  const comparativo = !ir ? null : h(
    'div',
    { class: 'ef-comparativo' },
    linhaDeComparacao('Eficiência', ir.eficienciaInicio, ir.eficienciaRecente, { casas: 2, unidade: '', dica: 'm/min por bpm' }),
    linhaDeComparacao('Velocidade', ir.velocidadeInicio, ir.velocidadeRecente, { casas: 1, unidade: ' km/h' }),
    linhaDeComparacao('FC média', ir.fcInicio, ir.fcRecente, { casas: 0, unidade: ' bpm', menorEMelhor: true, dica: 'menor é melhor' }),
  );

  // ---------- destaques ----------
  const vsMelhor = melhor ? pct(melhor.eficiencia, ultima.eficiencia) : null;
  const destaque = (rotulo, valor, detalhe, classe = '') => h('div', { class: `ef-destaque ${classe}`.trim() }, h('span', { class: 'cg-mini-rotulo' }, rotulo), h('strong', null, valor), detalhe ? h('small', { class: 'texto-secundario' }, detalhe) : null);
  const destaques = !melhor ? null : h(
    'div',
    { class: 'ef-destaques' },
    destaque('Melhor eficiência', num(melhor.eficiencia), `${formatarData(melhor.data)} · ${num(melhor.velocidadeKmh, 1)} km/h a ${num(melhor.fcMedia, 0)} bpm`),
    destaque('Última passagem', num(ultima.eficiencia), ultima.id === melhor.id ? 'é a melhor do trajeto' : `${textoDeVariacao(vsMelhor, 1)} em relação à melhor · ${formatarData(ultima.data)}`, ultima.id === melhor.id ? 'ef-destaque-melhor' : ''),
    destaque('Tendência', tend ? `${diferenca(tend.inclinacaoPorMes)} /mês` : '—', tend ? `pela reta das ${tend.pontos} passagens com FC` : 'Precisa de ao menos 3 passagens', tend ? `ef-destaque-${tom(tend.inclinacaoPorMes, false, 0.005)}` : ''),
    destaque('Amplitude', `${num(Math.min(...base.map((p) => p.eficiencia)))} a ${num(melhor.eficiencia)}`, `${plural(base.length, 'passagem com FC', 'passagens com FC')}${semFc ? ` · ${plural(semFc, 'sem FC fica de fora', 'sem FC ficam de fora')}` : ''}`),
  );

  // ---------- avisos e legenda ----------
  const avisos = [];
  if (noContexto.length) {
    const fatores = [...new Set(noContexto.flatMap((p) => contexto.get(p.id)))];
    avisos.push(h('p', { class: 'ef-aviso', role: 'note' }, `${plural(noContexto.length, 'passagem comparada tem', 'passagens comparadas têm')} fator de contexto (${fatores.join(', ').toLowerCase()}), o que pode distorcer a eficiência. Use “Ocultar passagens com calor ou frio” para ver sem elas.`));
  }
  if (ir && base.length < 4) avisos.push(h('p', { class: 'ef-aviso', role: 'note' }, 'Com poucas passagens, a comparação oscila muito. Ela fica mais confiável a cada treino novo no trajeto.'));

  const legenda = h(
    'p',
    { class: 'traj-legenda texto-secundario' },
    h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra ef-amostra-inicio' }), 'início'),
    h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra ef-amostra-recente' }), 'recente'),
    h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra ef-amostra-meio' }), 'entre os dois'),
    h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-contexto' }), 'calor, frio, dor ou sensação pesada'),
    h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-tendencia' }), 'tendência'),
    periodo ? h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra ef-amostra-periodo' }), 'período escolhido') : null,
  );

  return h(
    'section',
    { class: 'card pilha ef-cartao' },
    cabecalho,
    h('p', { class: 'texto-secundario' }, 'Eficiência aeróbica: metros por minuto para cada batimento por minuto. Quanto mais alto, mais rápido você anda para a mesma FC. Arraste no gráfico para escolher um período e clique em dois pontos para comparar as passagens.'),
    veredito,
    grafico,
    legenda,
    comparativo,
    destaques,
    ...avisos,
  );
}
