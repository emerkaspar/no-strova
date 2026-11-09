/** Estado compartilhado entre o cabeçalho (sino) e a tela de Notificações. */
const ouvintes = new Set();
let naoLidas = 0;

export function definirNaoLidas(n) {
  if (n === naoLidas) return;
  naoLidas = n;
  ouvintes.forEach((fn) => fn(naoLidas));
}

export function totalNaoLidas() {
  return naoLidas;
}

/** Assina mudanças no contador. Devolve a função que cancela. */
export function aoMudarNaoLidas(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
