import { icone } from '../../utils/icones.js';

/**
 * Liga o botão do topo de um card ao formulário recolhido. O estado (`estado.aberto`) vive fora do card para sobreviver
 * ao redesenho quando chegam dados novos. Devolve a função que abre/fecha o formulário por código.
 * Com `icones`, o botão é só um ícone pequeno (o texto vira título e rótulo de acessibilidade).
 * @param {{ estado: { aberto: boolean }, botao: HTMLButtonElement, form: HTMLFormElement, rotulo: string, classeFechado?: string, icones?: { fechado: string, aberto: string }|null }} p
 */
export function ligarFormRecolhivel({ estado, botao, form, rotulo, classeFechado = 'btn', icones = null }) {
  const aplicar = () => {
    form.hidden = !estado.aberto;
    const texto = estado.aberto ? 'Fechar' : rotulo;
    if (icones) {
      botao.replaceChildren(icone(estado.aberto ? icones.aberto : icones.fechado, 16));
      botao.className = 'btn-icone btn-icone-mini';
      botao.title = texto;
      botao.setAttribute('aria-label', texto);
    } else {
      botao.textContent = texto;
      botao.className = estado.aberto ? 'btn btn-secundario' : classeFechado;
    }
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
