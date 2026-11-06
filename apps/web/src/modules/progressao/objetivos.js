import { ehRecorrente, periodoDe, PERIODOS_DE_PROGRESSAO, resumoDaMeta, TIPOS_DE_PROGRESSAO } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';

const ESPORTES = { ciclismo: 'Ciclismo', corrida: 'Corrida', outro: 'Outros' };
const ORDEM_DOS_PERIODOS = ['semana', 'mes', 'ano'];
const TITULO_DO_GRUPO = Object.freeze({ semana: 'Objetivos da semana', mes: 'Objetivos do mês', ano: 'Objetivos do ano' });
const ROTULO_ESTADO = Object.freeze({
  atingido: 'Objetivo atingido',
  adiantado: 'Adiantado',
  'no-ritmo': 'No ritmo',
  atrasado: 'Atrasado',
  'nao-atingido': 'Não atingido',
  futuro: 'Ainda não começou',
});

export function formatarMetrica(tipo, v, { unidade = true } = {}) {
  const cfg = TIPOS_DE_PROGRESSAO[tipo];
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const texto = formatarNumero(v, cfg.casas);
  return unidade && cfg.unidade ? `${texto} ${cfg.unidade}` : texto;
}

/** Nome curto de um objetivo: "Distância · Ciclismo". */
export function nomeDoObjetivo(m) {
  const esportes = m.esportes?.length ? ` · ${m.esportes.map((e) => ESPORTES[e] ?? e).join(', ')}` : '';
  return `${TIPOS_DE_PROGRESSAO[m.tipo]?.rotulo ?? m.tipo}${esportes}`;
}

/** Ícone de medalha na cor do período (semana = bronze, mês = prata, ano = ouro); apagado quando não conquistada. */
function medalha(periodo, conquistada, tamanho = 22) {
  return h('span', { class: `medalha medalha-${periodo}${conquistada ? '' : ' medalha-apagada'}`, 'aria-hidden': 'true' }, icone('medalha', tamanho));
}

/** Meta que não rende mais nada: recorrente já encerrada, ou a do ano cujo período terminou. */
function estaEncerrada(meta, av, hoje) {
  return ehRecorrente(meta) ? Boolean(meta.ate) && av.periodo.fim < hoje : av.periodo.fim < hoje;
}

/**
 * Painel de objetivos: um grupo por período (semana, mês, ano), cada objetivo com seu progresso, status e medalha. Os
 * objetivos são independentes: atingir um não afeta os outros. Metas de semana e de mês são recorrentes: o cartão mostra
 * o período atual e o histórico (em quantos períodos o objetivo foi atingido).
 */
export function painelDeObjetivos({ metas, atividades, condicionamentoPorData, hoje, selecionadaId, aoSelecionar, acoes = null }) {
  if (metas.length === 0) {
    return h('p', { class: 'texto-secundario' }, 'Você ainda não criou objetivos. Use "Nova meta" para criar um de distância, tempo, elevação ou Condicionamento, por semana, mês ou ano.');
  }
  const avaliados = metas.map((meta) => ({ meta, r: resumoDaMeta({ meta, atividades, condicionamentoPorData, hoje }) }));

  const ativos = avaliados.filter((x) => !estaEncerrada(x.meta, x.r.atual, hoje));
  const noAtual = (estado) => ativos.filter((x) => x.r.atual.estado === estado).length;
  const emAndamento = ['adiantado', 'no-ritmo', 'atrasado'].reduce((n, e) => n + noAtual(e), 0);
  const totalBadges = avaliados.reduce((n, x) => n + x.r.atingidas, 0);
  const resumo = h(
    'p',
    { class: 'obj-resumo' },
    h('strong', null, `${totalBadges} ${totalBadges === 1 ? 'objetivo atingido' : 'objetivos atingidos'}`),
    ` no total · ${noAtual('atingido')} já ${noAtual('atingido') === 1 ? 'atingido' : 'atingidos'} no período atual · ${emAndamento} em andamento`,
  );

  const grupos = ORDEM_DOS_PERIODOS.map((periodo) => {
    const doGrupo = avaliados
      .filter((x) => x.meta.periodo === periodo)
      // vigentes primeiro (as mais recentes antes); encerradas por último
      .sort((a, b) => Number(estaEncerrada(a.meta, a.r.atual, hoje)) - Number(estaEncerrada(b.meta, b.r.atual, hoje)) || (a.meta.inicio < b.meta.inicio ? 1 : -1));
    if (doGrupo.length === 0) return null;
    return h(
      'section',
      { class: 'obj-grupo' },
      h('h3', { class: 'obj-grupo-titulo' }, medalha(periodo, true, 18), TITULO_DO_GRUPO[periodo], h('span', { class: 'obj-contagem' }, String(doGrupo.length))),
      h('div', { class: 'obj-lista' }, doGrupo.map(({ meta, r }) => cartaoDoObjetivo(meta, r, estaEncerrada(meta, r.atual, hoje), meta.id === selecionadaId, aoSelecionar, false, acoes ? { ...acoes, encerrada: estaEncerrada(meta, r.atual, hoje) } : null))),
    );
  });
  return h('div', { class: 'obj-painel' }, resumo, grupos);
}

/** "Todas as semanas" / "Todos os meses" (a concordância muda com o período). */
export const textoRecorrente = (periodo) => (periodo === 'mes' ? 'Todos os meses' : 'Todas as semanas');

const ICONE_DA_METRICA = Object.freeze({ distancia: 'rota', tempo: 'duracao', elevacao: 'elevacao', condicionamento: 'hrss' });

/** Título de uma linha só (Início): só ícones (métrica e esportes) e o período; o nome completo fica no tooltip e no texto de acessibilidade. */
function tituloCompacto(meta, quando, periodoRotulo) {
  const esportes = meta.esportes ?? [];
  return h(
    'div',
    { class: 'obj-titulo obj-titulo-compacto', title: `${nomeDoObjetivo(meta)} · ${quando}`, role: 'group', 'aria-label': `${nomeDoObjetivo(meta)} · ${quando}` },
    h('span', { class: 'obj-esporte obj-icone-metrica', 'aria-hidden': 'true' }, icone(ICONE_DA_METRICA[meta.tipo] ?? 'atividades', 15)),
    esportes.length > 0
      ? h('span', { class: 'obj-esportes', role: 'img', 'aria-label': esportes.map((e) => ESPORTES[e] ?? e).join(', ') }, esportes.map((e) => h('span', { class: `obj-esporte obj-esporte-${e}` }, icone(e, 15))))
      : null,
    // etiqueta colorida do período, logo depois dos ícones: "Ano 2026", "nov/2026" ou "Semana de 02/11"
    h('span', { class: `obj-tag obj-tag-${meta.periodo}` }, meta.periodo === 'ano' ? `Ano ${periodoRotulo}` : periodoRotulo.replace(/^Semana de /, 'Semana ')),
  );
}

/** Diferença até 2% do objetivo (para mais ou para menos) conta como "perto" do esperado. */
const TOLERANCIA_DO_MARCADOR = 2;

/**
 * Posição onde o progresso deveria estar hoje (em % do objetivo) e a cor do sinal: vermelho se está atrasado, verde se
 * adiantado e azul se a diferença é de até 2% do objetivo. Só existe com o período em andamento e sem o objetivo atingido.
 */
export function marcadorDoEsperado(meta, av) {
  if (!['adiantado', 'no-ritmo', 'atrasado'].includes(av.estado) || av.esperadoHoje === null || !(meta.valorAlvo > 0)) return null;
  const posicao = Math.min(100, Math.max(0, (av.esperadoHoje / meta.valorAlvo) * 100));
  const diferenca = ((av.atual - av.esperadoHoje) / meta.valorAlvo) * 100;
  const cor = Math.abs(diferenca) <= TOLERANCIA_DO_MARCADOR ? 'perto' : diferenca > 0 ? 'adiantado' : 'atrasado';
  return { posicao, cor, diferenca };
}

/** Cartão de um objetivo (o mesmo na Progressão e na Início). `resumo.instancias` = 0 esconde o histórico das metas recorrentes. */
export function cartaoDoObjetivo(meta, resumo, encerrada, selecionado, aoSelecionar, compacto = false, acoes = null) {
  const av = resumo.atual;
  const periodo = PERIODOS_DE_PROGRESSAO[meta.periodo];
  const recorrente = ehRecorrente(meta);
  const pct = av.percentual === null ? 0 : Math.round(av.percentual);
  const detalhe =
    av.estado === 'atingido'
      ? `Conquistado em ${formatarData(av.atingidaEm)}`
      : av.estado === 'futuro'
        ? `Começa em ${formatarData(av.periodo.inicio)}`
        : av.estado === 'nao-atingido'
          ? `Terminou com ${formatarMetrica(meta.tipo, av.atual)} (${pct}%)`
          : `Faltam ${formatarMetrica(meta.tipo, av.faltam)} · ${av.diasRestantes} ${av.diasRestantes === 1 ? 'dia' : 'dias'} · esperado até hoje: ${formatarMetrica(meta.tipo, av.esperadoHoje)}`;
  // histórico das metas recorrentes: quantos períodos já renderam badge
  const historico = recorrente && resumo.instancias > 0
    ? `${resumo.atingidas} de ${resumo.instancias} ${periodo.plural} atingid${meta.periodo === 'mes' ? 'o' : 'a'}${resumo.atingidas === 1 ? '' : 's'}${resumo.sequencia > 1 ? ` · ${resumo.sequencia} seguid${meta.periodo === 'mes' ? 'os' : 'as'}` : ''}`
    : null;
  const quando = recorrente ? `${textoRecorrente(meta.periodo)}${encerrada ? ' · encerrada' : meta.ate ? ' · encerra neste período' : ''}` : `${periodo.rotulo} ${av.periodo.rotulo}`;

  const marcador = marcadorDoEsperado(meta, av);
  const botao = h(
    'button',
    { class: `obj-cartao obj-${av.estado}${selecionado ? ' obj-selecionado' : ''}${encerrada ? ' obj-encerrada' : ''}`, type: 'button', 'aria-pressed': String(selecionado), title: 'Ver no gráfico' },
    h(
      'div',
      { class: 'obj-topo' },
      medalha(meta.periodo, av.estado === 'atingido' || resumo.atingidas > 0),
      compacto ? tituloCompacto(meta, quando, av.periodo.rotulo) : h('div', { class: 'obj-titulo' }, h('strong', null, nomeDoObjetivo(meta)), h('span', { class: 'texto-secundario' }, quando)),
      h('span', { class: `obj-estado obj-estado-${av.estado}` }, ROTULO_ESTADO[av.estado]),
    ),
    h(
      'div',
      { class: 'obj-valores' },
      h('strong', null, formatarMetrica(meta.tipo, av.estado === 'futuro' ? null : av.atual)),
      h('span', { class: 'texto-secundario' }, `de ${formatarMetrica(meta.tipo, meta.valorAlvo)}${recorrente && !compacto ? ` · ${av.periodo.rotulo}` : ''}`),
      h('span', { class: 'obj-pct' }, av.estado === 'futuro' ? '' : `${pct}%`),
    ),
    h(
      'div',
      { class: 'obj-trilho' },
      h('div', { class: 'obj-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Progresso do objetivo ${nomeDoObjetivo(meta)}` }, h('span', { style: `width:${pct}%` })),
      marcador
        ? h('span', { class: `obj-marcador obj-marcador-${marcador.cor}`, style: `left:${marcador.posicao}%`, title: `Esperado até hoje: ${formatarMetrica(meta.tipo, av.esperadoHoje)}`, 'aria-hidden': 'true' })
        : null,
    ),
    h('div', { class: 'texto-secundario obj-detalhe' }, detalhe),
    historico ? h('div', { class: 'obj-historico' }, historico) : null,
  );
  botao.addEventListener('click', () => aoSelecionar(meta));
  if (!acoes) return botao;

  // os botões de ação ficam sobre o canto do cartão, não dentro dele (um botão não pode conter outros botões)
  const acao = (rotulo, nomeIcone, variante, fn) => {
    const nome = `${rotulo} o objetivo ${nomeDoObjetivo(meta)}`;
    const b = h('button', { class: `btn-icone btn-icone-mini${variante ? ` btn-icone-${variante}` : ''}`, type: 'button', title: rotulo, 'aria-label': nome }, icone(nomeIcone, 16));
    b.addEventListener('click', () => fn(meta));
    return b;
  };
  const podeEncerrar = recorrente && !meta.ate && !acoes.encerrada;
  return h(
    'div',
    { class: 'obj-item' },
    botao,
    h(
      'div',
      { class: 'obj-acoes' },
      acao('Editar', 'lapis', '', acoes.editar),
      podeEncerrar ? acao('Encerrar (vale só até o fim do período atual)', 'bloquear', '', acoes.encerrar) : null,
      acao('Excluir', 'lixeira', 'perigo', acoes.excluir),
    ),
  );
}

/** Prateleira de badges: uma por objetivo atingido (concedida pelo servidor), das mais recentes para as mais antigas. */
export function prateleiraDeConquistas(conquistas) {
  if (conquistas.length === 0) return h('p', { class: 'texto-secundario' }, 'Atinja um objetivo para ganhar a sua primeira badge.');
  const ordenadas = [...conquistas].sort((a, b) => (a.atingidaEm < b.atingidaEm ? 1 : -1));
  return h(
    'div',
    { class: 'badges' },
    ordenadas.map((c) => {
      const per = PERIODOS_DE_PROGRESSAO[c.periodo];
      const instancia = typeof c.inicio === 'string' ? periodoDe(c.periodo, c.inicio).rotulo : per?.rotulo;
      return h(
        'article',
        { class: `badge badge-${c.periodo}` },
        c.vista === false ? h('span', { class: 'badge-nova' }, 'Nova') : null,
        medalha(c.periodo, true, 34),
        h('strong', { class: 'badge-nome' }, nomeDoObjetivo({ tipo: c.metrica, esportes: c.esportes })),
        h('span', { class: 'badge-meta' }, `${formatarMetrica(c.metrica, c.valorAlvo)} · ${instancia}`),
        h('span', { class: 'texto-secundario badge-data' }, `Conquistada em ${formatarData(c.atingidaEm)}`),
      );
    }),
  );
}
