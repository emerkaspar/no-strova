import { h } from './dom.js';

/** Logo do No Strova (public/logo.png). `grande` é para as telas de acesso; o padrão é o do cabeçalho. */
export function logo({ grande = false } = {}) {
  return h('img', {
    src: '/logo.png',
    alt: 'No Strova',
    class: grande ? 'logo logo-grande' : 'logo',
    width: grande ? 112 : 44,
    height: grande ? 112 : 44,
  });
}
