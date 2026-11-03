import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { dataPorExtenso, horaNoFuso, saudacaoDaHora } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { logo } from '../../utils/marca.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { pedirImportacao } from '../atividades/state.js';

function inicialDe(sessao) {
  const base = (sessao.perfil?.nome || sessao.email || '?').trim();
  return base.charAt(0).toUpperCase();
}

function primeiroNome(sessao) {
  return (sessao.perfil?.nome || '').trim().split(/\s+/)[0] || 'atleta';
}

/**
 * Cabeçalho de todas as telas: logo, data por extenso e saudação, menu em pílula, botão
 * "Importar arquivo" e avatar com menu (tema e sair). Abaixo de 768 px o menu vira barra de abas
 * no rodapé (os dois menus ficam no DOM; o CSS mostra um por vez).
 * @param {{ perfil?: any, email?: string }} sessao
 * @param {Array<{ caminho: string, rotulo: string, icone: string }>} itens
 */
export function criarCabecalho(sessao, itens) {
  // --- saudação e data (fuso de São Paulo) ---
  const saudacao = `${saudacaoDaHora(horaNoFuso())}, ${primeiroNome(sessao)}`;
  const marca = h(
    'div',
    { class: 'topo-marca' },
    h('a', { href: '#/inicio', class: 'topo-logo', 'aria-label': 'No Strova — Início' }, logo()),
    h('div', { class: 'topo-texto' }, h('p', { class: 'topo-data' }, dataPorExtenso()), h('p', { class: 'topo-saudacao' }, saudacao)),
  );

  // --- menu em pílula (desktop) e barra de abas (mobile) ---
  const linksPilula = itens.map((m) => h('a', { href: m.caminho, 'data-caminho': m.caminho }, m.rotulo));
  const pilula = h('nav', { class: 'menu-pilula', 'aria-label': 'Principal' }, ...linksPilula);
  const linksAbas = itens.map((m) => h('a', { href: m.caminho, 'data-caminho': m.caminho }, icone(m.icone), h('span', null, m.rotulo)));
  const abas = h('nav', { class: 'barra-abas', 'aria-label': 'Principal (abas)' }, ...linksAbas);

  function marcarAtivo(caminho) {
    for (const link of [...linksPilula, ...linksAbas]) {
      if (link.dataset.caminho === caminho) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  // --- botão de importar ---
  const importar = h(
    'button',
    { class: 'btn btn-importar', type: 'button', 'aria-label': 'Importar arquivo', onClick: pedirImportacao },
    'Importar',
    h('span', { class: 'so-desktop' }, ' arquivo'),
  );

  // --- avatar com menu ---
  const itemTema = h('button', { class: 'menu-conta-item', type: 'button', role: 'menuitem' });
  const itemSair = h('button', { class: 'menu-conta-item', type: 'button', role: 'menuitem', onClick: sair }, 'Sair');
  const menu = h('div', { class: 'menu-conta', role: 'menu', 'aria-label': 'Conta', hidden: true }, itemTema, itemSair);
  const avatar = h(
    'button',
    { class: 'avatar', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu da conta' },
    inicialDe(sessao),
  );

  function rotularTema() {
    itemTema.textContent = temaEfetivo() === 'escuro' ? 'Tema claro' : 'Tema escuro';
  }
  rotularTema();
  itemTema.addEventListener('click', () => {
    alternarTema();
    rotularTema();
    fechar(true);
  });

  const foraDoMenu = (e) => {
    if (!menu.contains(e.target) && !avatar.contains(e.target)) fechar(false);
  };
  const teclas = (e) => {
    if (e.key === 'Escape') fechar(true);
  };
  function abrir() {
    rotularTema();
    menu.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', foraDoMenu, true);
    document.addEventListener('keydown', teclas);
    itemTema.focus();
  }
  function fechar(devolverFoco) {
    menu.hidden = true;
    avatar.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', foraDoMenu, true);
    document.removeEventListener('keydown', teclas);
    if (devolverFoco) avatar.focus();
  }
  avatar.addEventListener('click', () => (menu.hidden ? abrir() : fechar(false)));

  const topo = h(
    'header',
    { class: 'topo' },
    h(
      'div',
      { class: 'container topo-conteudo' },
      marca,
      pilula,
      h('div', { class: 'topo-acoes' }, importar, h('div', { class: 'conta' }, avatar, menu)),
    ),
  );

  return {
    topo,
    abas,
    marcarAtivo,
    destruir() {
      document.removeEventListener('pointerdown', foraDoMenu, true);
      document.removeEventListener('keydown', teclas);
    },
  };
}
