import { h } from '../../utils/dom.js';

/**
 * Seções abertas da tela de Configuração. Todas começam recolhidas a cada vez que a tela abre (`reiniciarSecoes`); a lista fica
 * em memória só para que um cartão redesenhado por um snapshot do Firestore (a calibração, por exemplo) continue como o usuário o deixou.
 */
const abertas = new Set();

/** Chamado ao montar a tela: todas as seções voltam a ficar recolhidas. */
export function reiniciarSecoes() {
  abertas.clear();
}

/**
 * Cartão com título que recolhe e abre o corpo (começa recolhido), com ações opcionais à direita do título.
 * Recolhe e abre no próprio elemento, sem redesenhar a tela.
 * @param {{ id: string, titulo: string, acoes?: Node|null, corpo: Array<Node|null>|Node }} p
 * @returns {HTMLElement}
 */
export function secaoRecolhivel({ id, titulo, acoes = null, corpo }) {
  let recolhida = !abertas.has(id);
  const corpoId = `config-corpo-${id}`;
  const areaCorpo = h('div', { class: 'config-secao-corpo', id: corpoId, hidden: recolhida }, ...(Array.isArray(corpo) ? corpo : [corpo]));
  const botao = h(
    'button',
    { class: 'config-secao-titulo', type: 'button', 'aria-expanded': String(!recolhida), 'aria-controls': corpoId },
    h('h2', null, titulo),
    h('span', { class: 'config-secao-seta', 'aria-hidden': 'true' }, '▾'),
  );
  const raiz = h('section', { class: 'config-secao', id, 'data-recolhida': String(recolhida) }, h('div', { class: 'card' }, h('div', { class: 'bloco-topo' }, botao, acoes), areaCorpo));
  botao.addEventListener('click', () => {
    recolhida = !recolhida;
    areaCorpo.hidden = recolhida;
    botao.setAttribute('aria-expanded', String(!recolhida));
    raiz.dataset.recolhida = String(recolhida);
    if (recolhida) abertas.delete(id);
    else abertas.add(id);
  });
  return raiz;
}
