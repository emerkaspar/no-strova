import { formatarSono, leituraDoPeriodo, resumoSaude, SONO_IDEAL } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  for (const f of filhos) if (f !== null && f !== undefined) el.append(f);
  return el;
}

/** "17/11" para um dia; "10/11 a 16/11" para uma semana ou um mês. */
const rotuloDoPonto = (p) => (p.fim && p.fim !== p.data ? `${formatarData(p.data).slice(0, 5)} a ${formatarData(p.fim).slice(0, 5)}` : formatarData(p.data).slice(0, 5));

/**
 * Mini-gráfico de um cartão do resumo: a série do período com uma **referência** para comparar (faixa ideal, meta ou linha
 * tracejada) e, ao passar o mouse (ou tocar), o dia, a guia e o valor. Sem pelo menos 2 pontos, não desenha.
 * `referencia`: { faixa: [min, max] } ou { valor } (linha tracejada), na mesma unidade da série.
 * @returns {HTMLElement|null}
 */
function miniGrafico({ serie, classe, referencia = null, formatar, legenda = '' }) {
  if (serie.length < 2) return null;
  const L = 320; // largo e baixo: em um cartão de ~330 px o desenho fica com ~40 px de altura
  const A = 40;
  const PAD = 5;
  const valores = serie.map((s) => s.valor);
  const extras = referencia ? (referencia.faixa ? referencia.faixa : [referencia.valor]) : [];
  const todos = [...valores, ...extras].filter(Number.isFinite);
  const minimo = Math.min(...todos);
  const maximo = Math.max(...todos);
  const x = (i) => PAD + (i / (serie.length - 1)) * (L - 2 * PAD);
  const y = (v) => PAD + (1 - (v - minimo) / (maximo - minimo || 1)) * (A - 2 * PAD);

  const guia = svg('line', { class: 'saude-mini-guia', x1: 0, x2: 0, y1: 2, y2: A - 2, visibility: 'hidden' });
  const marcador = svg('circle', { class: 'saude-mini-marcador', r: 2.8, cx: 0, cy: 0, visibility: 'hidden' });
  const ultimo = svg('circle', { class: 'saude-mini-ultimo', r: 2.6, cx: x(serie.length - 1).toFixed(1), cy: y(valores[valores.length - 1]).toFixed(1) });
  const grafico = svg(
    'svg',
    { class: `saude-mini ${classe}`, viewBox: `0 0 ${L} ${A}`, 'aria-hidden': 'true' },
    referencia?.faixa ? svg('rect', { class: 'saude-mini-faixa', x: 0, y: y(referencia.faixa[1]).toFixed(1), width: L, height: Math.max(1, y(referencia.faixa[0]) - y(referencia.faixa[1])).toFixed(1) }) : null,
    referencia && referencia.valor !== undefined ? svg('line', { class: 'saude-mini-ref', x1: 0, x2: L, y1: y(referencia.valor).toFixed(1), y2: y(referencia.valor).toFixed(1) }) : null,
    svg('polyline', { points: serie.map((s, i) => `${x(i).toFixed(1)},${y(s.valor).toFixed(1)}`).join(' ') }),
    guia,
    ultimo,
    marcador,
  );

  const dica = h('div', { class: 'saude-mini-dica', role: 'status', hidden: true });
  const area = h('div', { class: 'saude-mini-area', 'aria-label': legenda || undefined }, grafico, dica);

  function mostrar(e) {
    const caixa = grafico.getBoundingClientRect();
    const xSvg = ((e.clientX - caixa.left) / (caixa.width || 1)) * L;
    const i = Math.min(serie.length - 1, Math.max(0, Math.round(((xSvg - PAD) / (L - 2 * PAD)) * (serie.length - 1))));
    const p = serie[i];
    guia.setAttribute('x1', x(i));
    guia.setAttribute('x2', x(i));
    guia.setAttribute('visibility', 'visible');
    marcador.setAttribute('cx', x(i));
    marcador.setAttribute('cy', y(p.valor));
    marcador.setAttribute('visibility', 'visible');
    dica.replaceChildren(h('span', { class: 'saude-mini-dica-data' }, rotuloDoPonto(p)), h('strong', null, formatar(p.valor)));
    dica.hidden = false;
    const pct = (x(i) / L) * 100;
    dica.style.left = `${Math.min(88, Math.max(12, pct))}%`; // não sai pelas bordas do cartão
  }
  function limpar() {
    guia.setAttribute('visibility', 'hidden');
    marcador.setAttribute('visibility', 'hidden');
    dica.hidden = true;
  }
  area.addEventListener('pointermove', mostrar);
  area.addEventListener('pointerdown', mostrar);
  area.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') limpar();
  });
  return h('div', { class: 'saude-mini-bloco' }, area, legenda ? h('span', { class: 'saude-mini-legenda' }, legenda) : null);
}

function cartaoDoResumo({ nomeIcone, rotulo, valor, delta = '', tom = 'neutro', nota = '', grafico = null, classe }) {
  return h(
    'article',
    { class: `saude-card saude-card-${classe}` },
    h('div', { class: 'saude-card-topo' }, h('span', { class: 'saude-card-icone' }, icone(nomeIcone, 16)), h('span', { class: 'saude-card-rotulo' }, rotulo)),
    h('strong', { class: 'saude-card-valor' }, valor),
    delta ? h('span', { class: `saude-card-delta saude-tom-${tom}` }, delta) : null,
    grafico,
    nota ? h('span', { class: 'saude-card-nota' }, nota) : null,
  );
}

/**
 * Resumo da página Saúde: quatro cartões (peso, sono, passos e carga de treino) com a variação contra o período anterior, um
 * mini-gráfico com referência (faixa ideal, meta, ponto de partida ou média anterior) e dica ao passar o mouse, e a "leitura
 * do período" (frases curtas geradas dos dados). Responde "como estou indo?" sem rolar a página.
 * `periodo()` devolve { dias }; `metaPassos()` e `perderPeso()` vêm da tela.
 * @returns {{ el: HTMLElement, atualizar: () => void }}
 */
export function criarResumoDaSaude({ dados, hoje, periodo, metaPassos, perderPeso }) {
  const el = h('section', { class: 'card saude-resumo' });

  function atualizar() {
    const p = periodo();
    const r = resumoSaude({ pesagens: dados.pesagens, bemEstar: dados.bemEstar, estresse: dados.dias, metaPassos: metaPassos(), hoje, dias: p.dias });
    const leitura = leituraDoPeriodo(r, { perderPeso: perderPeso() });
    const contra = p.dias === null ? '' : ' contra o período anterior';

    // peso: a variação é boa quando vai na direção da meta; sem meta fica neutra
    const pv = r.peso.variacaoKg;
    const dirPeso = perderPeso();
    const tomPeso = pv === null || Math.abs(pv) < 0.05 || dirPeso === null ? 'neutro' : pv < 0 === dirPeso ? 'ok' : 'atencao';
    // sono: cor pela faixa da média; passos: pelo percentual da meta; carga: neutra (só sinaliza subida forte)
    const tomSono = { ideal: 'ok', curto: 'atencao', 'muito-curto': 'alerta', longo: 'neutro' }[r.sono.faixa] ?? 'neutro';
    const pct = r.passos.pctMeta === null ? null : Math.round(r.passos.pctMeta);
    const tomPassos = pct === null ? 'neutro' : pct >= 100 ? 'ok' : pct >= 70 ? 'atencao' : 'alerta';
    const dSono = r.sono.mediaS !== null && r.sono.anteriorS !== null ? r.sono.mediaS - r.sono.anteriorS : null;
    const vc = r.carga.variacaoPct;
    const porPonto = { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[r.carga.granularidade] ?? '';

    el.replaceChildren(
      h(
        'div',
        { class: 'saude-resumo-cartoes' },
        cartaoDoResumo({
          classe: 'peso',
          nomeIcone: 'peso',
          rotulo: 'Peso',
          valor: r.peso.atualKg === null ? '—' : `${formatarNumero(r.peso.atualKg, 1)} kg`,
          delta: pv === null ? '' : `${sinal(pv)}${formatarNumero(Math.abs(pv), 1)} kg no período`,
          tom: tomPeso,
          nota: r.peso.data ? `em ${formatarData(r.peso.data)}` : 'Sem pesagens',
          grafico: miniGrafico({
            serie: r.peso.serie,
            classe: 'peso',
            // comparação: de onde o peso partiu no período
            referencia: r.peso.serie.length ? { valor: r.peso.serie[0].valor } : null,
            formatar: (v) => `${formatarNumero(v, 1)} kg`,
            legenda: 'linha tracejada: início do período',
          }),
        }),
        cartaoDoResumo({
          classe: 'sono',
          nomeIcone: 'lua',
          rotulo: 'Sono por noite',
          valor: r.sono.mediaS === null ? '—' : formatarSono(r.sono.mediaS),
          delta: dSono !== null && Math.abs(dSono) >= 600 ? `${sinal(dSono)}${formatarSono(Math.abs(dSono))}${contra}` : '',
          tom: tomSono,
          nota: r.sono.mediaS === null ? 'Sem registros' : `${r.sono.noites} noites registradas`,
          grafico: miniGrafico({
            serie: r.sono.serie,
            classe: 'sono',
            referencia: { faixa: [SONO_IDEAL.minS, SONO_IDEAL.maxS] },
            formatar: formatarSono,
            legenda: 'faixa sombreada: ideal de 7 a 9 h',
          }),
        }),
        cartaoDoResumo({
          classe: 'passos',
          nomeIcone: 'corrida',
          rotulo: 'Passos por dia',
          valor: r.passos.media === null ? '—' : formatarNumero(r.passos.media, 0),
          delta: pct === null ? '' : `${pct}% da meta`,
          tom: tomPassos,
          nota: r.passos.media === null ? 'Sem registros' : `${r.passos.dias} dias registrados`,
          grafico: miniGrafico({
            serie: r.passos.serie,
            classe: 'passos',
            referencia: { valor: r.passos.meta },
            formatar: (v) => `${formatarNumero(v, 0)} passos`,
            legenda: `linha tracejada: meta de ${formatarNumero(r.passos.meta, 0)}`,
          }),
        }),
        cartaoDoResumo({
          classe: 'carga',
          nomeIcone: 'hrss',
          rotulo: 'Carga de treino',
          valor: r.carga.total > 0 ? `${formatarNumero(r.carga.porSemana, 0)} HRSS` : '—',
          delta: vc !== null && Math.abs(vc) >= 5 ? `${sinal(vc)}${formatarNumero(Math.abs(vc), 0)}%${contra}` : '',
          tom: vc !== null && vc > 40 ? 'atencao' : 'neutro',
          nota: r.carga.total > 0 ? 'por semana' : 'Sem treinos no período',
          grafico: r.carga.total > 0
            ? miniGrafico({
                serie: r.carga.serie,
                classe: 'carga',
                referencia: r.carga.referenciaPorGrupo === null ? null : { valor: r.carga.referenciaPorGrupo },
                formatar: (v) => `${formatarNumero(v, 0)} HRSS ${porPonto}`,
                legenda: r.carga.referenciaPorGrupo === null ? '' : 'linha tracejada: média do período anterior',
              })
            : null,
        }),
      ),
      h(
        'div',
        { class: 'saude-leitura' },
        h('h3', { class: 'saude-leitura-titulo' }, 'Leitura do período'),
        leitura.length === 0
          ? h('p', { class: 'texto-secundario' }, 'Ainda não há dados suficientes neste período para uma leitura.')
          : h('ul', { class: 'saude-leitura-lista' }, ...leitura.map((f) => h('li', { class: `saude-tom-${f.tom}` }, h('span', { class: 'saude-leitura-ponto', 'aria-hidden': 'true' }), f.texto))),
      ),
    );
  }

  atualizar();
  return { el, atualizar };
}
