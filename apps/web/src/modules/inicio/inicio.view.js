import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { h } from '../../utils/dom.js';

export function render(raiz, sessao) {
  const nome = sessao.perfil?.nome || 'atleta';
  const passos = h('div');
  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, `Olá, ${nome}`),
      h('p', { class: 'texto-secundario' }, 'Importe seus treinos (.fit, .gpx, .tcx) ou registre-os manualmente. Em breve: gráfico de Fitness/Fadiga/Forma, plano de treino e controle de peso.'),
      passos,
    ),
  );

  const cancelar = observarConfigs(
    sessao.uid,
    (configs) => {
      passos.replaceChildren(
        configs.length === 0
          ? h(
              'p',
              { class: 'mensagem' },
              'Primeiro passo: cadastre a sua FC máxima, FC de repouso e LTHR para calcular o HRSS. ',
              h('a', { href: '#/configuracao' }, 'Abrir Configuração'),
            )
          : h('p', null, h('a', { href: '#/atividades' }, 'Ver minhas atividades')),
      );
    },
    () => {},
  );
  return cancelar;
}
