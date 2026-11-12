import { h } from '../../utils/dom.js';
import { render as renderAdesao } from './adesao.view.js';
import { render as renderAprovacoes } from './aprovacoes.view.js';
import { criarCartaoLimiteIa } from './limiteIa.js';
import { estadoAdmin } from './state.js';
import { render as renderUsuarios } from './usuarios.view.js';

const ABAS = [
  { id: 'aprovacoes', rotulo: 'Aprovações' },
  { id: 'usuarios', rotulo: 'Usuários' },
  { id: 'adesao', rotulo: 'Adesão' },
  { id: 'sistema', rotulo: 'Sistema' },
];

/** Aba "Sistema": ajustes que só o dono do sistema faz (hoje, o limite das sugestões de IA). */
function renderSistema(raiz) {
  const limite = criarCartaoLimiteIa();
  raiz.replaceChildren(h('div', { class: 'pilha' }, limite));
  return () => limite.cancelar();
}

/**
 * Página de Administração (só admin): abas Aprovações (fila de novos usuários), Usuários (CRUD e funcionalidades
 * liberadas) e Sistema (ajustes do sistema).
 * @returns {() => void} limpa a aba aberta ao sair da página
 */
export function render(raiz, sessao) {
  const conteudo = h('div');
  const abas = h('div', { class: 'ativ-grupo', role: 'tablist', 'aria-label': 'Administração' });
  let limparAba = () => {};

  function abrir(id) {
    estadoAdmin.aba = ABAS.some((a) => a.id === id) ? id : 'aprovacoes';
    limparAba();
    const renderAba = { sistema: renderSistema, usuarios: renderUsuarios, adesao: renderAdesao }[estadoAdmin.aba] ?? renderAprovacoes;
    limparAba = renderAba(conteudo, sessao) ?? (() => {});
    abas.replaceChildren(
      ...ABAS.map((a) =>
        h('button', { type: 'button', role: 'tab', class: `ativ-chip${a.id === estadoAdmin.aba ? ' ativo' : ''}`, 'aria-selected': String(a.id === estadoAdmin.aba), onClick: () => abrir(a.id) }, a.rotulo),
      ),
    );
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'ativ-pagina' },
      h('header', { class: 'ativ-cabecalho' }, h('div', null, h('h1', null, 'Administração'), h('p', { class: 'texto-secundario' }, 'Aprovação e cadastro de usuários, adesão ao sistema, funcionalidades liberadas por usuário e ajustes do sistema. Só você, como administrador, vê esta página.'))),
      abas,
      conteudo,
    ),
  );
  abrir(estadoAdmin.aba);
  return () => limparAba();
}
