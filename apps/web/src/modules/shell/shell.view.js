import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { render as renderAprovacoes } from '../admin/aprovacoes.view.js';
import { render as renderInicio } from '../inicio/inicio.view.js';

const ROTAS = {
  '#/inicio': { rotulo: 'Início', render: renderInicio },
  '#/admin': { rotulo: 'Aprovações', render: renderAprovacoes, soAdmin: true },
};

export function render(raiz, sessao) {
  const rotasVisiveis = Object.entries(ROTAS).filter(([, r]) => !r.soAdmin || sessao.admin);
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

  function rotaAtual() {
    const hash = window.location.hash;
    return rotasVisiveis.some(([caminho]) => caminho === hash) ? hash : '#/inicio';
  }

  function desenharRota() {
    destruirRota?.();
    const caminho = rotaAtual();
    nav.replaceChildren(
      ...rotasVisiveis.map(([c, r]) => h('a', { href: c, 'aria-current': c === caminho ? 'page' : null }, r.rotulo)),
    );
    destruirRota = ROTAS[caminho].render(saida, sessao);
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
