import { h } from './dom.js';
import { icone } from './icones.js';

const ICONE_DO_TIPO = { ok: 'ok', info: 'info', erro: 'alerta', carregando: 'garmin' };

/**
 * Aviso em faixa, com ícone e botão de fechar. Mesma interface de `areaMensagem` (`el`, `mostrar`, `limpar`), com os tipos
 * `ok`, `info`, `erro` e `carregando` (este sem botão de fechar, com o ícone girando).
 */
export function avisoDispensavel() {
  const texto = h('span', { class: 'aviso-texto' });
  const iconeEl = h('span', { class: 'aviso-icone', 'aria-hidden': 'true' });
  const fechar = h('button', { class: 'aviso-fechar', type: 'button', 'aria-label': 'Fechar aviso', title: 'Fechar' }, icone('fechar', 16));
  const el = h('div', { class: 'aviso-faixa', role: 'status', hidden: true }, iconeEl, texto, fechar);

  function limpar() {
    el.hidden = true;
    texto.textContent = '';
  }
  fechar.addEventListener('click', limpar);

  return {
    el,
    mostrar(mensagem, tipo = 'erro') {
      texto.textContent = mensagem;
      el.className = `aviso-faixa aviso-${tipo}`;
      el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
      iconeEl.replaceChildren(icone(ICONE_DO_TIPO[tipo] ?? 'info', 20));
      fechar.hidden = tipo === 'carregando';
      el.hidden = false;
    },
    limpar,
  };
}
