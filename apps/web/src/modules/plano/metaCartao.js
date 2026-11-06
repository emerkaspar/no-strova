import { h } from '../../utils/dom.js';

/** Número com sinal explícito ("+2,9", "−0,3") para diferenças e ritmos. `formatar` formata o valor absoluto. */
export const comSinal = (valor, formatar) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${formatar(Math.abs(valor))}`;

/** Tom visual de cada estado da avaliação: positivo (chega lá), atenção (fica acima) e negativo (fica abaixo). */
const TOM = Object.freeze({ atinge: 'positivo', acima: 'atencao', abaixo: 'negativo', 'sem-dados': 'neutro' });

/**
 * Casca visual de uma meta do Plano (Condicionamento ou Forma): cabeçalho com título, situação e ações; indicadores em
 * pequenos blocos; progresso; orientação curta e contagem regressiva; metas anteriores. Só apresenta: os valores vêm prontos
 * de quem chama, que continua dono da lógica, do formulário e das ações.
 * @param {{
 *   id: string, titulo: string, estado: string, rotuloEstado: string|null,
 *   acoes: Array<HTMLElement|null>,
 *   introducao?: string|null,
 *   metricas?: Array<{ rotulo: string, valor: string, sufixo?: string, destaque?: boolean }>,
 *   progresso?: { pct: number, atual: string, objetivo: string, rotulo: string }|null,
 *   aviso?: HTMLElement|null,
 *   orientacao?: string|null,
 *   dias?: { dias: number, dataAlvo: string }|null,
 *   extras?: Array<HTMLElement|null>,
 *   anteriores?: Array<{ valor: string, data: string }>
 * }} p
 */
export function montarCartaoDeMeta({ id, titulo, estado, rotuloEstado, acoes, introducao = null, metricas = [], progresso = null, aviso = null, orientacao = null, dias = null, extras = [], anteriores = [] }) {
  const tom = TOM[estado] ?? 'neutro';

  const topo = h(
    'header',
    { class: 'mc-topo' },
    h(
      'div',
      { class: 'mc-titulos' },
      h('h3', { class: 'mc-titulo' }, titulo),
      rotuloEstado ? h('span', { class: 'mc-estado', role: 'status' }, h('span', { class: 'mc-ponto', 'aria-hidden': 'true' }), rotuloEstado) : null,
    ),
    h('div', { class: 'mc-acoes' }, ...acoes),
  );

  const indicadores = metricas.length
    ? h(
        'dl',
        { class: 'mc-metricas' },
        ...metricas.map((m) =>
          h('div', { class: `mc-metrica${m.destaque ? ' mc-metrica-destaque' : ''}` }, h('dt', null, m.rotulo), h('dd', null, m.valor, m.sufixo ? h('small', null, ` ${m.sufixo}`) : null)),
        ),
      )
    : null;

  const barra = progresso
    ? h(
        'div',
        { class: 'mc-progresso' },
        h('div', { class: 'mc-progresso-topo' }, h('span', null, 'Progresso'), h('strong', null, `${progresso.pct}%`)),
        h('div', { class: 'mc-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(progresso.pct), 'aria-label': progresso.rotulo }, h('span', { style: `width:${progresso.pct}%` })),
        h('p', { class: 'mc-progresso-valores' }, h('span', null, `Atual ${progresso.atual}`), h('span', null, `Objetivo ${progresso.objetivo}`)),
      )
    : null;

  const rodape =
    orientacao || dias
      ? h(
          'footer',
          { class: 'mc-rodape' },
          orientacao ? h('p', { class: 'mc-orientacao' }, orientacao) : h('span'),
          dias
            ? h(
                'p',
                { class: 'mc-dias', title: `Até ${dias.dataAlvo}` },
                h('strong', null, dias.dias === 0 ? 'Hoje' : String(dias.dias)),
                dias.dias === 0 ? null : h('span', null, dias.dias === 1 ? 'dia' : 'dias'),
              )
            : null,
        )
      : null;

  const listaAnteriores = anteriores.length
    ? h(
        'details',
        { class: 'mc-anteriores' },
        h('summary', null, h('span', null, 'Metas anteriores'), h('span', { class: 'mc-anteriores-n' }, String(anteriores.length))),
        h('ul', null, ...anteriores.map((a) => h('li', null, h('span', { class: 'mc-ant-valor' }, a.valor), h('span', { class: 'mc-ant-data' }, a.data)))),
      )
    : null;

  return h(
    'section',
    { class: `card mc mc-${tom}`, id },
    topo,
    introducao ? h('p', { class: 'mc-intro' }, introducao) : null,
    indicadores,
    barra,
    aviso,
    rodape,
    ...extras,
    listaAnteriores,
  );
}
