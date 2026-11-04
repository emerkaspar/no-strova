import { DESCRICOES_RECURSOS, RECURSOS, RECURSOS_PADRAO, ROTULOS_RECURSOS } from '@no-strova/domain';
import { atualizarUsuarioAdmin } from '../../core/functions.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';

/**
 * Lista de funcionalidades com um interruptor (switch) cada. Vale para qualquer recurso de RECURSOS: ao incluir um
 * novo no domain (com rótulo e descrição), ele aparece aqui sozinho.
 * @returns {{ el: HTMLElement, ler: () => Record<string, boolean> }}
 */
export function listaDeRecursos(inicial = RECURSOS_PADRAO, prefixo = 'rec') {
  const linhas = Object.values(RECURSOS).map((chave) => {
    const id = `${prefixo}-${chave}`;
    const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'interruptor-input', checked: inicial[chave] === true });
    const linha = h(
      'label',
      { class: 'recurso-linha', for: id },
      h('span', { class: 'recurso-texto' }, h('strong', null, ROTULOS_RECURSOS[chave] ?? chave), h('small', null, DESCRICOES_RECURSOS[chave] ?? '')),
      h('span', { class: 'interruptor' }, input, h('span', { class: 'interruptor-trilho', 'aria-hidden': 'true' }, h('span', { class: 'interruptor-bolinha' }))),
    );
    return { chave, input, linha };
  });
  return {
    el: h('div', { class: 'recursos-lista' }, ...linhas.map((l) => l.linha)),
    ler: () => Object.fromEntries(linhas.map((l) => [l.chave, l.input.checked])),
  };
}

/**
 * Modal "Funcionalidades" de um usuário: interruptores e botão Salvar.
 * @param {{ uid: string, nome: string, email: string, recursos: Record<string, boolean> }} usuario
 * @param {() => void | Promise<void>} aoSalvar chamado depois de gravar, com o modal já fechado
 */
export function abrirModalRecursos(usuario, aoSalvar) {
  const dialogo = h('dialog', { class: 'modal-dia modal-recursos', 'aria-labelledby': 'modal-recursos-titulo' });
  const fechar = () => dialogo.close();
  const botaoFechar = h('button', { class: 'modal-dia-fechar', type: 'button', 'aria-label': 'Fechar' }, '×');
  botaoFechar.addEventListener('click', fechar);

  const lista = listaDeRecursos(usuario.recursos, 'modal-rec');
  const mensagem = areaMensagem();
  const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar');
  const cancelar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Cancelar');
  cancelar.addEventListener('click', fechar);

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(salvar, mensagem, async () => {
          await atualizarUsuarioAdmin({ uid: usuario.uid, recursos: lista.ler() });
          fechar();
          await aoSalvar();
        });
      },
    },
    lista.el,
    mensagem.el,
    h('div', { class: 'linha-botoes modal-recursos-rodape' }, cancelar, salvar),
  );

  dialogo.append(
    h(
      'header',
      { class: 'modal-dia-topo' },
      h('div', null, h('h2', { id: 'modal-recursos-titulo' }, 'Funcionalidades'), h('p', { class: 'texto-secundario' }, usuario.nome || usuario.email)),
      botaoFechar,
    ),
    form,
  );
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) fechar();
  });
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
}
