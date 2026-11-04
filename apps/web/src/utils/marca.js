import { h } from './dom.js';
import { NOME_APP } from '../core/constants.js';

/**
 * Logo da interface. `grande` é o ícone (public/icons/naostrova-icone.svg), das telas de status. O padrão (cabeçalho)
 * é o ícone do app (public/icons/icon-512.png), que traz o próprio fundo e por isso serve
 * aos dois temas; o slogan vai em texto, sorteado em utils/slogans.js.
 */
export function logo({ grande = false } = {}) {
  if (grande) {
    return h('img', { src: '/icons/naostrova-icone.svg', alt: NOME_APP, class: 'logo logo-grande', width: 112, height: 112 });
  }
  return h('img', { src: '/icons/icon-512.png', alt: NOME_APP, class: 'logo', width: 56, height: 56 });
}

/** Logo completo com slogan (public/logo/naostrova-logo-laranja.svg), para a tela de login sobre fundo laranja. */
export function logoCompleto() {
  return h('img', {
    src: '/logo/naostrova-logo-laranja.svg',
    alt: NOME_APP,
    class: 'logo-completo',
    width: 252,
    height: 143,
  });
}
