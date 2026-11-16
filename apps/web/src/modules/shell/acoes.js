import { aoMudarSessao, sair } from '../../application/sessao.js';
import { preencherAvatar } from '../../utils/avatar.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { aoMudarNaoLidas, totalNaoLidas } from '../notificacoes/state.js';
import { abrirConta } from '../conta/conta.modal.js';
import { abrirWizard } from '../onboarding/wizard.js';

/*
 * Ações da conta (notificações, tema e perfil), compartilhadas entre o cabeçalho (celular: ícones redondos no topo) e a
 * barra lateral (desktop: itens do rodapé). A variante muda só a marcação; a lógica é uma só.
 * `variante`: 'topo' (ícone redondo) ou 'rail' (ícone sobre rótulo, com dica).
 */

/** Rótulo e dica dos itens da barra lateral (o nome também vai no aria-label). */
function itemDeRail(elemento, nomeIcone, rotulo, ...extras) {
  elemento.classList.add('rail-item');
  elemento.append(h('span', { class: 'rail-pilula' }, icone(nomeIcone, 20), ...extras), h('span', { class: 'rail-rotulo' }, rotulo), h('span', { class: 'rail-dica', role: 'tooltip' }, rotulo));
  return elemento;
}

/** Sino: link para a central, com o contador (topo) ou o ponto vermelho (rail) quando há não lidas. */
export function criarSino(variante = 'topo') {
  const rail = variante === 'rail';
  const contador = h('span', { class: rail ? 'rail-ponto' : 'sino-contador', 'aria-hidden': 'true', hidden: true });
  const el = rail
    ? itemDeRail(h('a', { href: '#/notificacoes', 'data-caminho': '#/notificacoes' }), 'sino', 'Avisos', contador)
    : h('a', { class: 'btn-icone sino', href: '#/notificacoes', 'data-caminho': '#/notificacoes' }, icone('sino', 22), contador);

  function rotular(n) {
    const texto = n > 0 ? `Notificações: ${n} ${n === 1 ? 'não lida' : 'não lidas'}` : 'Notificações';
    if (!rail) contador.textContent = n > 99 ? '99+' : String(n);
    contador.hidden = n === 0;
    el.setAttribute('aria-label', texto);
    if (!rail) el.title = texto;
  }
  rotular(totalNaoLidas());
  const parar = aoMudarNaoLidas(rotular);

  return {
    el,
    marcarAtivo(caminho) {
      if (caminho === '#/notificacoes') el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    },
    destruir: parar,
  };
}

/** Tema: sol no tema escuro e lua no claro; o clique alterna (lógica de utils/tema.js). */
export function criarBotaoTema(variante = 'topo') {
  const rail = variante === 'rail';
  const el = h('button', { class: rail ? '' : 'btn-icone', type: 'button' });
  function rotular() {
    const escuro = temaEfetivo() === 'escuro';
    const texto = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    if (rail) {
      el.replaceChildren();
      itemDeRail(el, escuro ? 'sol' : 'lua', 'Tema');
    } else {
      el.replaceChildren(icone(escuro ? 'sol' : 'lua', 22));
      el.title = texto;
    }
    el.setAttribute('aria-label', texto);
  }
  rotular();
  el.addEventListener('click', () => {
    alternarTema();
    rotular();
  });
  return { el };
}

/**
 * Avatar com o menu da conta (Minha conta, Perfil de treino, Administração só para admin, Sair). Fecha com Esc ou clique
 * fora. Na barra lateral o menu abre ao lado do avatar (ver rail.css).
 */
export function criarConta(sessao, variante = 'topo') {
  const rail = variante === 'rail';
  const itemAdmin = sessao.admin ? h('a', { class: 'menu-conta-item', href: '#/admin', role: 'menuitem', 'data-caminho': '#/admin' }, icone('aprovacoes', 18), 'Administração') : null;
  const itemConta = h(
    'button',
    {
      class: 'menu-conta-item',
      type: 'button',
      role: 'menuitem',
      onClick: () => {
        fechar(false);
        abrirConta();
      },
    },
    icone('perfil', 18),
    'Minha conta',
  );
  const itemPerfil = h(
    'button',
    {
      class: 'menu-conta-item',
      type: 'button',
      role: 'menuitem',
      onClick: () => {
        fechar(false);
        abrirWizard({ sessao });
      },
    },
    icone('treinos', 18),
    'Perfil de treino',
  );
  const itemSair = h('button', { class: 'menu-conta-item', type: 'button', role: 'menuitem', onClick: sair }, icone('sair', 18), 'Sair');
  const perfil = h(
    'div',
    { class: 'menu-conta-perfil' },
    h('strong', null, (sessao.perfil?.nome || '').trim() || 'Minha conta'),
    sessao.email ? h('span', null, sessao.email) : null,
  );
  const menu = h('div', { class: `menu-conta${rail ? ' menu-conta-rail' : ''}`, role: 'menu', 'aria-label': 'Conta', hidden: true }, perfil, h('div', { class: 'menu-conta-itens' }, itemConta, itemPerfil, itemAdmin, itemSair));
  const avatar = h('button', { class: `avatar${rail ? ' rail-avatar' : ''}`, type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu da conta' });
  // foto, personagem ou inicial; acompanha o perfil quando o usuário troca o avatar
  const nomeNoMenu = perfil.querySelector('strong');
  const pararSessao = aoMudarSessao((s) => {
    preencherAvatar(avatar, { uid: s.uid, perfil: s.perfil, email: s.email });
    nomeNoMenu.textContent = (s.perfil?.nome || '').trim() || 'Minha conta';
  });

  const foraDoMenu = (e) => {
    if (!menu.contains(e.target) && !avatar.contains(e.target)) fechar(false);
  };
  const teclas = (e) => {
    if (e.key === 'Escape') fechar(true);
  };
  function abrir() {
    menu.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', foraDoMenu, true);
    document.addEventListener('keydown', teclas);
    itemConta.focus();
  }
  function fechar(devolverFoco) {
    menu.hidden = true;
    avatar.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', foraDoMenu, true);
    document.removeEventListener('keydown', teclas);
    if (devolverFoco) avatar.focus();
  }
  avatar.addEventListener('click', () => (menu.hidden ? abrir() : fechar(false)));
  // ir para a Administração fecha o menu
  itemAdmin?.addEventListener('click', () => fechar(false));

  const el = h(
    'div',
    { class: `conta${rail ? ' rail-conta' : ''}` },
    avatar,
    rail ? h('span', { class: 'rail-rotulo' }, 'Perfil') : null,
    rail ? h('span', { class: 'rail-dica', role: 'tooltip' }, 'Perfil') : null,
    menu,
  );

  return {
    el,
    /** Administração mora no menu da conta: na tela dela, o avatar fica destacado. */
    marcarAtivo(caminho) {
      const naAdmin = caminho === '#/admin';
      avatar.classList.toggle('avatar-ativo', naAdmin);
      if (naAdmin) itemAdmin?.setAttribute('aria-current', 'page');
      else itemAdmin?.removeAttribute('aria-current');
    },
    destruir() {
      pararSessao();
      document.removeEventListener('pointerdown', foraDoMenu, true);
      document.removeEventListener('keydown', teclas);
    },
  };
}
