import { calcularSerieForma, ehRecorrente, PERIODOS_DE_PROGRESSAO, resumoDaMeta } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';
import { aplicarMetaAoEstado, criarAnalise, estadoInicialDaAnalise } from './analise.js';
import { formatarMetrica, marcadorDoEsperado, nomeDoObjetivo, nosDoMarcador, ROTULO_ESTADO, textoRecorrente } from './objetivos.js';

/**
 * Abre o objetivo em um modal: situação (o que foi e o que falta), histórico dos períodos, filtros, cartões, gráfico de
 * comparação com os períodos anteriores e a tabela. Tem estado próprio: mexer nos filtros não altera a página.
 * @param {{ meta: any, dados: { atividades: any[], dias: any[], metas: any[] }, hoje: string, acoes?: { editar?: (meta: any) => void } | null }} p
 */
export function abrirObjetivo({ meta, dados, hoje, acoes = null }) {
  let analise = null;
  const aberto = abrirModal({
    classe: 'modal-objetivo',
    rotulo: `Objetivo ${nomeDoObjetivo(meta)}`,
    fecharNoFundo: true,
    conteudo: (fechar) => {
      const condicionamentoPorData = new Map(calcularSerieForma(dados.dias, { ate: hoje }).map((d) => [d.data, d.fitness]));
      const resumo = resumoDaMeta({ meta, atividades: dados.atividades, condicionamentoPorData, hoje });
      const av = resumo.atual;
      const periodo = PERIODOS_DE_PROGRESSAO[meta.periodo];
      const recorrente = ehRecorrente(meta);
      const pct = av.percentual === null ? 0 : Math.round(av.percentual);
      const quando = recorrente ? `${textoRecorrente(meta.periodo)}${meta.ate ? ' · encerra no período atual' : ''}` : `${periodo.rotulo} ${av.periodo.rotulo}`;
      const detalhe =
        av.estado === 'atingido'
          ? `Conquistado em ${formatarData(av.atingidaEm)}`
          : av.estado === 'futuro'
            ? `Começa em ${formatarData(av.periodo.inicio)}`
            : av.estado === 'nao-atingido'
              ? `Terminou com ${formatarMetrica(meta.tipo, av.atual)} (${pct}%)`
              : `Faltam ${formatarMetrica(meta.tipo, av.faltam)} · ${av.diasRestantes} ${av.diasRestantes === 1 ? 'dia' : 'dias'}${marcadorDoEsperado(meta, av) ? '' : ` · esperado até hoje: ${formatarMetrica(meta.tipo, av.esperadoHoje)}`}`;
      const historico = recorrente && resumo.instancias > 0 ? `${resumo.atingidas} de ${resumo.instancias} ${periodo.plural} atingid${meta.periodo === 'mes' ? 'o' : 'a'}${resumo.atingidas === 1 ? '' : 's'}${resumo.sequencia > 1 ? ` · ${resumo.sequencia} seguid${meta.periodo === 'mes' ? 'os' : 'as'}` : ''}` : null;
      const marcador = marcadorDoEsperado(meta, av);

      const fecharBtn = h('button', { type: 'button', class: 'treino-modal-fechar', 'aria-label': 'Fechar', title: 'Fechar' }, icone('fechar', 18));
      fecharBtn.addEventListener('click', () => fechar(undefined));
      const editar = acoes?.editar
        ? h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno' }, icone('lapis', 14), ' Editar')
        : null;
      editar?.addEventListener('click', () => {
        fechar(undefined);
        acoes.editar(meta);
      });

      const estado = estadoInicialDaAnalise();
      aplicarMetaAoEstado(estado, meta, hoje);
      analise = criarAnalise({ dados, hoje, estado });

      return h(
        'div',
        { class: 'obj-modal' },
        h(
          'header',
          { class: 'obj-modal-topo' },
          h('span', { class: `medalha medalha-${meta.periodo}${av.estado === 'atingido' || resumo.atingidas > 0 ? '' : ' medalha-apagada'}`, 'aria-hidden': 'true' }, icone('medalha', 30)),
          h('div', { class: 'obj-modal-titulo' }, h('h2', null, nomeDoObjetivo(meta)), h('span', { class: 'texto-secundario' }, quando)),
          h('span', { class: `obj-estado obj-estado-${av.estado}` }, ROTULO_ESTADO[av.estado]),
          editar,
          fecharBtn,
        ),
        h(
          'section',
          { class: `obj-modal-resumo obj-${av.estado}` },
          h('div', { class: 'obj-valores' }, h('strong', null, formatarMetrica(meta.tipo, av.estado === 'futuro' ? null : av.atual)), h('span', { class: 'texto-secundario' }, `de ${formatarMetrica(meta.tipo, meta.valorAlvo)}${recorrente ? ` · ${av.periodo.rotulo}` : ''}`), h('span', { class: 'obj-pct' }, av.estado === 'futuro' ? '' : `${pct}%`)),
          h(
            'div',
            { class: `obj-trilho${marcador ? ' obj-trilho-com-rotulo' : ''}` },
            h('div', { class: 'obj-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Progresso do objetivo ${nomeDoObjetivo(meta)}` }, h('span', { style: `width:${pct}%` })),
            ...nosDoMarcador(meta, av, marcador),
          ),
          h('div', { class: 'texto-secundario obj-detalhe' }, detalhe),
          historico ? h('div', { class: 'obj-historico' }, historico) : null,
        ),
        analise.el,
      );
    },
  });
  aberto.then(() => analise?.destruir());
  return aberto;
}

/**
 * "Comparar períodos": a mesma análise do modal do objetivo, sem objetivo. Escolha o período, a métrica e os esportes e compare
 * o acumulado com os períodos anteriores.
 * @param {{ dados: { atividades: any[], dias: any[], metas: any[] }, hoje: string }} p
 */
export function abrirComparacao({ dados, hoje }) {
  let analise = null;
  const aberto = abrirModal({
    classe: 'modal-objetivo',
    rotulo: 'Comparar períodos',
    fecharNoFundo: true,
    conteudo: (fechar) => {
      const fecharBtn = h('button', { type: 'button', class: 'treino-modal-fechar', 'aria-label': 'Fechar', title: 'Fechar' }, icone('fechar', 18));
      fecharBtn.addEventListener('click', () => fechar(undefined));
      analise = criarAnalise({ dados, hoje, estado: estadoInicialDaAnalise(), prefixo: 'cp' });
      return h(
        'div',
        { class: 'obj-modal' },
        h(
          'header',
          { class: 'obj-modal-topo' },
          h('span', { class: 'obj-icone-comparar', 'aria-hidden': 'true' }, icone('atividades', 26)),
          h('div', { class: 'obj-modal-titulo' }, h('h2', null, 'Comparar períodos'), h('span', { class: 'texto-secundario' }, 'Compare o acumulado com os períodos anteriores, sem precisar de um objetivo.')),
          fecharBtn,
        ),
        analise.el,
      );
    },
  });
  aberto.then(() => analise?.destruir());
  return aberto;
}
