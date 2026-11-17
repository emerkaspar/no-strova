import { salvarPesagem } from '../../application/peso.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { abrirModal } from '../../utils/modal.js';

/**
 * Janela "Registrar peso" (data e peso). Uma pesagem por dia: registrar de novo na mesma data substitui a anterior.
 * Resolve `true` quando registrou, `undefined` se o usuário cancelou.
 */
export function abrirRegistroDePeso({ uid, hoje }) {
  return abrirModal({
    classe: 'modal-meta modal-registro-peso',
    rotulo: 'Registrar peso',
    conteudo: (fechar) => {
      const data = campo({ id: 'peso-data', rotulo: 'Data', tipo: 'date', value: hoje, max: hoje });
      const peso = campo({ id: 'peso-kg', rotulo: 'Peso (kg)', inputmode: 'decimal', placeholder: 'ex.: 82,4', autocomplete: 'off' });
      const mensagem = areaMensagem();
      const salvar = h('button', { class: 'btn', type: 'submit' }, 'Registrar peso');
      const cancelar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Cancelar');
      const form = h(
        'form',
        { class: 'prog-form', novalidate: true },
        h('h2', null, 'Registrar peso'),
        h('div', { class: 'prog-form-grade' }, data.raiz, peso.raiz),
        mensagem.el,
        h('div', { class: 'prog-rodape' }, h('p', { class: 'texto-secundario' }, 'Uma pesagem por dia: se registrar de novo na mesma data, ela substitui a anterior.'), h('div', { class: 'linha-botoes' }, salvar, cancelar)),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        executarComBotao(salvar, mensagem, async () => {
          await salvarPesagem({ uid, entrada: { data: data.input.value, pesoKg: peso.input.value }, hoje });
          fechar(true);
        });
      });
      setTimeout(() => peso.input.focus(), 0);
      return form;
    },
  });
}
