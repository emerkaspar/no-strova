import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';

/**
 * Cartão de indicador (mesmo estilo dos recordes): ícone, rótulo, valor grande e uma nota no rodapé. `gravidade`
 * (ok, atencao, alerta) colore a faixa lateral e o valor; `classeNota` colore a nota; `extra` entra entre o valor e o rodapé.
 */
export function cartao({ rotulo, nomeIcone, valor, nota = null, classeNota = '', gravidade = '', extra = null, largo = false }) {
  return h(
    'article',
    { class: `ativ-recorde${largo ? ' ativ-recorde-largo' : ''}${gravidade ? ` peso-${gravidade}-cartao` : ''}` },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: `ativ-recorde-valor${gravidade ? ` peso-${gravidade}` : ''}` }, valor),
    extra,
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: `ativ-recorde-quando ${classeNota}` }, nota)) : null,
  );
}
