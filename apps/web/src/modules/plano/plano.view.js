import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';

/** Plano de treino: a tela completa (calendário e projeção) chega na próxima etapa. */
export function render(raiz) {
  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, 'Plano de treino'),
      estadoVazio('Em breve: planeje treinos futuros e veja a projeção do Fitness, da Fadiga e da Forma.'),
    ),
  );
  return () => {};
}
