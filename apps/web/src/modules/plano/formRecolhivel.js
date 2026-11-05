/**
 * Liga o botão do topo de um card ao formulário recolhido. O estado (`estado.aberto`) vive fora do card para sobreviver
 * ao redesenho quando chegam dados novos. Devolve a função que abre/fecha o formulário por código.
 * @param {{ estado: { aberto: boolean }, botao: HTMLButtonElement, form: HTMLFormElement, rotulo: string, classeFechado?: string }} p
 */
export function ligarFormRecolhivel({ estado, botao, form, rotulo, classeFechado = 'btn' }) {
  const aplicar = () => {
    form.hidden = !estado.aberto;
    botao.textContent = estado.aberto ? 'Fechar' : rotulo;
    botao.className = estado.aberto ? 'btn btn-secundario' : classeFechado;
    botao.setAttribute('aria-expanded', String(estado.aberto));
  };
  botao.addEventListener('click', () => {
    estado.aberto = !estado.aberto;
    aplicar();
    if (estado.aberto) form.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });
  aplicar();
  return (valor) => {
    estado.aberto = valor;
    aplicar();
  };
}
