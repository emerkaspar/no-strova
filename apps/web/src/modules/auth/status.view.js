import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { logo } from '../../utils/marca.js';

function telaStatus(raiz, titulo, mensagem, sessao) {
  raiz.replaceChildren(
    h(
      'main',
      { class: 'centralizado' },
      h(
        'div',
        { class: 'card' },
        logo({ grande: true }),
        h('h1', null, titulo),
        h('p', { class: 'texto-secundario' }, mensagem),
        sessao?.email ? h('p', { class: 'texto-secundario' }, `Conta: ${sessao.email}`) : null,
        h('button', { class: 'btn btn-secundario btn-bloco', type: 'button', onClick: sair }, 'Sair'),
      ),
    ),
  );
  return () => {};
}

export function renderCarregando(raiz) {
  raiz.replaceChildren(h('main', { class: 'centralizado' }, h('p', { class: 'texto-secundario', role: 'status' }, 'Carregando…')));
  return () => {};
}

export function renderPendente(raiz, sessao) {
  return telaStatus(
    raiz,
    'Aguardando aprovação',
    'Seu cadastro foi recebido. Um administrador precisa aprovar o seu acesso. Esta tela atualiza sozinha quando isso acontecer.',
    sessao,
  );
}

export function renderBloqueado(raiz, sessao) {
  return telaStatus(raiz, 'Acesso bloqueado', 'O acesso desta conta está bloqueado. Fale com o administrador.', sessao);
}

export function renderErro(raiz, sessao) {
  return telaStatus(raiz, 'Algo deu errado', sessao.erro ?? 'Não foi possível carregar a sua conta.', sessao);
}
