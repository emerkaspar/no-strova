/** Meta que a Início pediu para abrir na Progressão (clique num objetivo). Consumida uma vez ao abrir a tela. */
let metaPedida = null;

export function pedirMetaNaProgressao(id) {
  metaPedida = id;
}

export function consumirMetaPedida() {
  const id = metaPedida;
  metaPedida = null;
  return id;
}
