import { h } from './dom.js';
import { icone } from './icones.js';

/**
 * Modal de confirmação do app (no lugar do `confirm()` do navegador). Use sempre que uma ação pedir "tem certeza?".
 *
 *   if (!(await confirmar({ titulo: 'Excluir a prova?', mensagem: 'Isso não pode ser desfeito.', tipo: 'perigo', confirmarTexto: 'Excluir', icone: 'lixeira' }))) return;
 *
 * - `tipo`: 'perigo' (exclusão ou ação irreversível; botão vermelho e foco em "Cancelar"), 'aviso' (cuidado, mas reversível)
 *   ou 'info' (confirmação comum, o padrão). Define a cor e o ícone padrão.
 * - `icone`: nome de utils/icones.js para trocar o ícone do tipo (ex.: 'lixeira', 'bloquear', 'plano').
 * - Resolve `true` ao confirmar e `false` ao cancelar, tocar fora ou apertar Esc.
 * Usa o elemento <dialog> nativo: o foco fica preso no modal, Esc fecha e o foco volta para onde estava.
 *
 * @param {{ titulo: string, mensagem?: string, tipo?: 'perigo'|'aviso'|'info', icone?: string, confirmarTexto?: string, cancelarTexto?: string }} opcoes
 * @returns {Promise<boolean>}
 */
export function confirmar({ titulo, mensagem = '', tipo = 'info', icone: nomeIcone, confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar' }) {
  const ICONE_DO_TIPO = { perigo: 'alerta', aviso: 'alerta', info: 'info' };
  const anterior = document.activeElement;

  return new Promise((resolver) => {
    const dialogo = h('dialog', { class: `modal modal-${tipo}`, 'aria-labelledby': 'modal-titulo', 'aria-describedby': mensagem ? 'modal-mensagem' : null });
    const cancelar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(false) }, cancelarTexto);
    const ok = h('button', { class: tipo === 'perigo' ? 'btn btn-perigo-cheio' : 'btn', type: 'button', onClick: () => fechar(true) }, confirmarTexto);

    let resolvido = false;
    function fechar(resposta) {
      if (resolvido) return;
      resolvido = true;
      dialogo.close();
      dialogo.remove();
      if (anterior && typeof anterior.focus === 'function') anterior.focus();
      resolver(resposta);
    }

    dialogo.append(
      h(
        'div',
        { class: 'modal-corpo' },
        h('span', { class: 'modal-icone', 'aria-hidden': 'true' }, icone(nomeIcone ?? ICONE_DO_TIPO[tipo] ?? 'info', 26)),
        h('div', { class: 'modal-texto' }, h('h2', { id: 'modal-titulo', class: 'modal-titulo' }, titulo), mensagem ? h('p', { id: 'modal-mensagem', class: 'modal-mensagem' }, mensagem) : null),
      ),
      h('div', { class: 'modal-acoes' }, cancelar, ok),
    );

    // Esc (evento "cancel") e toque no fundo valem como cancelar
    dialogo.addEventListener('cancel', (e) => {
      e.preventDefault();
      fechar(false);
    });
    dialogo.addEventListener('click', (e) => {
      if (e.target === dialogo) fechar(false);
    });

    document.body.append(dialogo);
    dialogo.showModal();
    // ação destrutiva: o foco começa em "Cancelar", para um Enter sem querer não apagar nada
    (tipo === 'perigo' ? cancelar : ok).focus();
  });
}

/**
 * Modal genérico com conteúdo próprio (formulários). Mesmo <dialog> e mesma moldura do `confirmar`.
 *
 *   const resultado = await abrirModal({ classe: 'modal-feedback', rotulo: 'Como foi?', conteudo: (fechar) => formulario(fechar) });
 *
 * - `conteudo(fechar)` devolve o nó do modal; `fechar(valor)` fecha e resolve a promessa com `valor`.
 * - Esc fecha e resolve `undefined`. O toque no fundo só fecha se `fecharNoFundo` for true (por padrão não,
 *   para ninguém perder o que digitou).
 * - O foco volta para onde estava.
 *
 * @param {{ classe?: string, rotulo: string, conteudo: (fechar: (valor?: any) => void) => Node, fecharNoFundo?: boolean }} opcoes
 * @returns {Promise<any>}
 */
export function abrirModal({ classe = '', rotulo, conteudo, fecharNoFundo = false }) {
  const anterior = document.activeElement;

  return new Promise((resolver) => {
    const dialogo = h('dialog', { class: `modal ${classe}`.trim(), 'aria-label': rotulo });

    let resolvido = false;
    function fechar(valor) {
      if (resolvido) return;
      resolvido = true;
      dialogo.classList.add('modal-saindo');
      const terminar = () => {
        dialogo.close();
        dialogo.remove();
        if (anterior && typeof anterior.focus === 'function') anterior.focus();
        resolver(valor);
      };
      // espera a animação de saída, a menos que o usuário prefira menos movimento
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) terminar();
      else setTimeout(terminar, 140);
    }

    dialogo.append(conteudo(fechar));
    dialogo.addEventListener('cancel', (e) => {
      e.preventDefault();
      fechar(undefined);
    });
    if (fecharNoFundo) {
      dialogo.addEventListener('click', (e) => {
        if (e.target === dialogo) fechar(undefined);
      });
    }

    document.body.append(dialogo);
    dialogo.showModal();
  });
}
