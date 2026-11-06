import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';

/**
 * Métrica de uma linha de Configuração: ícone e rótulo em cinza, valor em destaque embaixo (o mesmo padrão da lista de Atividades).
 * @param {string} nomeIcone
 * @param {string|Node} rotulo texto ou elemento (por exemplo, com popover)
 * @param {string|Node|Array<string|Node>} valor
 */
export function metricaCartao(nomeIcone, rotulo, valor) {
  return h('div', { class: 'ativ-metrica' }, h('span', { class: 'ativ-metrica-rotulo' }, icone(nomeIcone, 16), rotulo), h('strong', { class: 'ativ-metrica-valor' }, valor));
}

/**
 * Linha em dois andares, como a de Atividades: identificação (ícone, texto pequeno, título e, à direita, ações ou um dado) e, em
 * baixo, as métricas. O layout segue a largura do próprio card (container query): lado a lado quando há espaço, empilhado se não.
 * @param {{ atual?: boolean, nomeIcone: string, topo: Array<string|Node>, titulo: Node, lado?: Array<Node>, metricas: Node[], colunas: number }} p
 *   `atual` põe a faixa lateral de 3px; `colunas` é quantas métricas cabem lado a lado.
 */
export function linhaCartao({ atual = false, nomeIcone, topo, titulo, lado = [], metricas, colunas }) {
  return h(
    'li',
    { class: `cfg-linha${atual ? ' cfg-linha-atual' : ''}`, style: `--n:${colunas}` },
    h(
      'div',
      { class: 'cfg-cartao' },
      h(
        'div',
        { class: 'cfg-id' },
        h('div', { class: 'cfg-icone', 'aria-hidden': 'true' }, icone(nomeIcone, 22)),
        h('div', { class: 'cfg-ident' }, h('div', { class: 'cfg-ident-topo' }, ...topo), titulo),
        h('div', { class: 'cfg-lado' }, ...lado),
      ),
      h('div', { class: 'cfg-metricas' }, ...metricas),
    ),
  );
}
