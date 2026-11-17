import { formatarSono, leituraDoPeriodo, resumoSaude } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');

/** Mini-linha de um cartão: a série do período, com o último ponto marcado. Sem pelo menos 2 pontos, não desenha. */
function miniLinha(serie, classe) {
  if (serie.length < 2) return null;
  const L = 120;
  const A = 30;
  const minimo = Math.min(...serie);
  const maximo = Math.max(...serie);
  const x = (i) => 2 + (i / (serie.length - 1)) * (L - 4);
  const y = (v) => 3 + (1 - (v - minimo) / (maximo - minimo || 1)) * (A - 6);
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${L} ${A}`);
  el.setAttribute('class', `saude-mini ${classe}`);
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('aria-hidden', 'true');
  const linha = document.createElementNS(NS, 'polyline');
  linha.setAttribute('points', serie.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
  el.append(linha);
  return el;
}

function cartaoDoResumo({ nomeIcone, rotulo, valor, delta = '', tom = 'neutro', nota = '', serie = [], classe }) {
  return h(
    'article',
    { class: `saude-card saude-card-${classe}` },
    h('div', { class: 'saude-card-topo' }, h('span', { class: 'saude-card-icone' }, icone(nomeIcone, 16)), h('span', { class: 'saude-card-rotulo' }, rotulo)),
    h('strong', { class: 'saude-card-valor' }, valor),
    delta ? h('span', { class: `saude-card-delta saude-tom-${tom}` }, delta) : null,
    miniLinha(serie, classe),
    nota ? h('span', { class: 'saude-card-nota' }, nota) : null,
  );
}

/**
 * Resumo da página Saúde: quatro cartões (peso, sono, passos e carga de treino) com a variação contra o período anterior e a
 * "leitura do período" (frases curtas geradas dos dados). Responde "como estou indo?" sem rolar a página.
 * `periodo()` devolve { dias, rotulo }; `metaPassos()` e `perderPeso()` vêm da tela.
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
          serie: r.peso.serie,
        }),
        cartaoDoResumo({
          classe: 'sono',
          nomeIcone: 'lua',
          rotulo: 'Sono por noite',
          valor: r.sono.mediaS === null ? '—' : formatarSono(r.sono.mediaS),
          delta: dSono !== null && Math.abs(dSono) >= 600 ? `${sinal(dSono)}${formatarSono(Math.abs(dSono))}${contra}` : '',
          tom: tomSono,
          nota: r.sono.mediaS === null ? 'Sem registros' : `${r.sono.noites} noites · ideal 7 a 9 h`,
          serie: r.sono.serie,
        }),
        cartaoDoResumo({
          classe: 'passos',
          nomeIcone: 'corrida',
          rotulo: 'Passos por dia',
          valor: r.passos.media === null ? '—' : formatarNumero(r.passos.media, 0),
          delta: pct === null ? '' : `${pct}% da meta`,
          tom: tomPassos,
          nota: r.passos.media === null ? 'Sem registros' : `${r.passos.dias} dias · meta ${formatarNumero(r.passos.meta, 0)}`,
          serie: r.passos.serie,
        }),
        cartaoDoResumo({
          classe: 'carga',
          nomeIcone: 'hrss',
          rotulo: 'Carga de treino',
          valor: r.carga.total > 0 ? `${formatarNumero(r.carga.porSemana, 0)} HRSS` : '—',
          delta: vc !== null && Math.abs(vc) >= 5 ? `${sinal(vc)}${formatarNumero(Math.abs(vc), 0)}%${contra}` : '',
          tom: vc !== null && vc > 40 ? 'atencao' : 'neutro',
          nota: r.carga.total > 0 ? 'por semana' : 'Sem treinos no período',
          serie: r.carga.serie,
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
