/** Estado da tela de acesso: alternar entre entrar e criar conta. */
export const estadoAuth = {
  modo: 'entrar', // 'entrar' | 'criar'
};

export function definirModo(modo) {
  estadoAuth.modo = modo;
}
