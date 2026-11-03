import { h } from './dom.js';

/** Estado vazio curto de um bloco: uma frase e, opcionalmente, um link de ação. */
export function estadoVazio(texto, acao) {
  return h(
    'p',
    { class: 'vazio-curto' },
    texto,
    acao ? [' ', h('a', { href: acao.href }, acao.rotulo)] : null,
  );
}
