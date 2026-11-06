import { h } from './dom.js';
import { NOME_APP } from '../core/constants.js';

/**
 * Logo da interface. `grande` é o ícone (public/icons/naostrova-icone.svg), das telas de status. O padrão (cabeçalho)
 * é o ícone do app (public/icons/icon-512.png), que traz o próprio fundo e por isso serve
 * aos dois temas; a frase vai em texto, sorteada em utils/frases.js.
 */
export function logo({ grande = false } = {}) {
  if (grande) {
    return h('img', { src: '/icons/naostrova-icone.svg', alt: NOME_APP, class: 'logo logo-grande', width: 112, height: 112 });
  }
  return h('img', { src: '/icons/icon-512.png', alt: NOME_APP, class: 'logo', width: 56, height: 56 });
}

/**
 * Logo horizontal sem slogan do cabeçalho (public/logo/naostrova-logo-*-sem-slogan.svg). Devolve as duas
 * versões (texto branco para o tema escuro, texto preto para o claro); o CSS mostra a do tema ativo.
 */
export function logosCabecalho() {
  const img = (src, tema) =>
    h('img', { src, alt: tema === 'escuro' ? NOME_APP : '', class: `logo logo-cabecalho logo-${tema}`, width: 176, height: 72 });
  return [
    img('/logo/naostrova-logo-escuro-sem-slogan.svg', 'escuro'),
    img('/logo/naostrova-logo-claro-sem-slogan.svg', 'claro'),
  ];
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
