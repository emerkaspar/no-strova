import { obterSessao } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { abrirWizard } from '../onboarding/wizard.js';

/**
 * Link para mudar os dias de treino: abre o Perfil de treino (o mesmo do menu da conta) já no passo "Semana", onde ficam os
 * dias de treino, o dia do longão, as horas por semana e o esporte principal.
 */
export function linkDosDiasDeTreino(rotulo = 'dias de treino') {
  return h('button', { class: 'btn-link', type: 'button', title: 'Abrir o Perfil de treino no passo "Semana"', onClick: () => abrirWizard({ sessao: obterSessao(), passoInicial: 'semana' }) }, rotulo);
}
