import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';

/**
 * Cartão de indicador da Progressão (mesmo estilo dos recordes). `gravidade`: 'ok', 'atencao' ou 'alerta' pinta a faixa e o valor.
 * @param {{ rotulo: string, nomeIcone: string, valor: string, nota?: string|null, gravidade?: string }} p
 */
export function cartaoIndicador({ rotulo, nomeIcone, valor, nota = null, gravidade = '' }) {
  return h(
    'article',
    { class: `ativ-recorde${gravidade ? ` peso-${gravidade}-cartao` : ''}` },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: `ativ-recorde-valor${gravidade ? ` peso-${gravidade}` : ''}` }, valor),
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: 'ativ-recorde-quando' }, nota)) : null,
  );
}
