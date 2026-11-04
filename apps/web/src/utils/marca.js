import { h } from './dom.js';
import { NOME_APP } from '../core/constants.js';

/**
 * Logo da interface. `grande` é o ícone (public/icons/naostrova-icone.svg), das telas de status. O padrão (cabeçalho)
 * é o logo sem slogan, em duas versões (escuro, para o tema escuro; claro, para o claro) e o CSS mostra a do tema atual; o slogan vai em texto, sorteado em utils/slogans.js.
 */
export function logo({ grande = false } = {}) {
  if (grande) {
    return h('img', { src: '/icons/naostrova-icone.svg', alt: NOME_APP, class: 'logo logo-grande', width: 112, height: 112 });
  }
  const versao = (tema) =>
    h('img', { src: `/logo/naostrova-logo-${tema}-sem-slogan.png`, alt: NOME_APP, class: `logo logo-${tema}`, width: 107, height: 44 });
  return [versao('escuro'), versao('claro')];
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
