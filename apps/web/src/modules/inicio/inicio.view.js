import { h } from '../../utils/dom.js';

export function render(raiz, sessao) {
  const nome = sessao.perfil?.nome || 'atleta';
  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, `Olá, ${nome}`),
      h('p', { class: 'texto-secundario' }, 'Sua conta está ativa. Em breve: atividades, gráfico de Fitness/Fadiga/Forma, plano de treino e controle de peso.'),
    ),
  );
  return () => {};
}
