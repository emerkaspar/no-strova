import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { render as renderAprovacoes } from '../admin/aprovacoes.view.js';
import { render as renderDetalhe } from '../atividades/detalhe.view.js';
import { render as renderAtividades } from '../atividades/lista.view.js';
import { render as renderConfiguracao } from '../configuracao/configuracao.view.js';
import { render as renderInicio } from '../inicio/inicio.view.js';

// Itens do menu. `prefixo` marca o item como ativo também nas sub-rotas.
const MENU = [
  { caminho: '#/inicio', rotulo: 'Início' },
  { caminho: '#/atividades', rotulo: 'Atividades' },
  { caminho: '#/configuracao', rotulo: 'Configuração' },
  { caminho: '#/admin', rotulo: 'Aprovações', soAdmin: true },
];

/** Resolve o hash em { menu, render, params }. Rotas desconhecidas ou proibidas caem no Início. */
function resolverRota(hash, admin) {
  const detalhe = /^#\/atividades\/([A-Za-z0-9_-]{8,40})$/.exec(hash);
  if (detalhe) return { menu: '#/atividades', render: renderDetalhe, params: { id: detalhe[1] } };
  switch (hash) {
    case '#/atividades':
      return { menu: hash, render: renderAtividades, params: {} };
    case '#/configuracao':
      return { menu: hash, render: renderConfiguracao, params: {} };
    case '#/admin':
      if (admin) return { menu: hash, render: renderAprovacoes, params: {} };
      break;
    default:
  }
  return { menu: '#/inicio', render: renderInicio, params: {} };
}

export function render(raiz, sessao) {
  const itens = MENU.filter((m) => !m.soAdmin || sessao.admin);
  const saida = h('main', { class: 'container' });
  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Principal' });
  let destruirRota = null;

  const botaoTema = h('button', {
    class: 'btn btn-secundario',
    type: 'button',
    onClick: () => {
      alternarTema();
      rotularTema();
    },
  });
  function rotularTema() {
    botaoTema.textContent = temaEfetivo() === 'escuro' ? 'Tema claro' : 'Tema escuro';
  }
  rotularTema();

  function desenharRota() {
    destruirRota?.();
    const rota = resolverRota(window.location.hash, sessao.admin);
    nav.replaceChildren(
      ...itens.map((m) => h('a', { href: m.caminho, 'aria-current': m.caminho === rota.menu ? 'page' : null }, m.rotulo)),
    );
    window.scrollTo(0, 0);
    destruirRota = rota.render(saida, sessao, rota.params);
  }

  raiz.replaceChildren(
    h(
      'header',
      { class: 'app-header' },
      h(
        'div',
        { class: 'container' },
        h('span', { class: 'marca' }, 'No Strova'),
        nav,
        h('div', { class: 'app-acoes' }, botaoTema, h('button', { class: 'btn btn-secundario', type: 'button', onClick: sair }, 'Sair')),
      ),
    ),
    saida,
  );

  window.addEventListener('hashchange', desenharRota);
  desenharRota();

  return () => {
    window.removeEventListener('hashchange', desenharRota);
    destruirRota?.();
  };
}
