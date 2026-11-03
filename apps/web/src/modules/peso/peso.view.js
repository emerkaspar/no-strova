import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';

/** Peso e metas: a tela completa chega em uma etapa futura. */
export function render(raiz) {
  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, 'Peso'),
      estadoVazio('Em breve: registre o peso, acompanhe a tendência e defina metas.'),
    ),
  );
  return () => {};
}
