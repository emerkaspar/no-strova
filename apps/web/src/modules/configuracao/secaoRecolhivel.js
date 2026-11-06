import { h } from '../../utils/dom.js';

/** Seções recolhidas da tela de Configuração, guardadas no navegador (cada snapshot do Firestore redesenha alguns cartões). */
const CHAVE_RECOLHIDAS = 'ns:configuracao:recolhidas';

function lerRecolhidas() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECOLHIDAS) ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    // navegador sem armazenamento (janela privada, dados bloqueados): tudo aberto
    return [];
  }
}

function salvarRecolhidas(lista) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify(lista));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

/**
 * Cartão com título que recolhe e abre o corpo (o app lembra a escolha), com ações opcionais à direita do título.
 * Recolhe e abre no próprio elemento, sem redesenhar a tela.
 * @param {{ id: string, titulo: string, acoes?: Node|null, corpo: Array<Node|null>|Node }} p
 * @returns {HTMLElement}
 */
export function secaoRecolhivel({ id, titulo, acoes = null, corpo }) {
  let recolhida = lerRecolhidas().includes(id);
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
    const sem = lerRecolhidas().filter((x) => x !== id);
    salvarRecolhidas(recolhida ? [...sem, id] : sem);
  });
  return raiz;
}
