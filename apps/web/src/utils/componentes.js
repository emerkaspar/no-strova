import { h } from './dom.js';
import { seletor } from './listaSuspensa.js';

/** Campo de formulário com rótulo. Retorna { raiz, input }. */
export function campo({ id, rotulo, tipo = 'text', dica, ...atributos }) {
  const input = h('input', { id, name: id, type: tipo, ...atributos });
  const raiz = h(
    'div',
    { class: 'campo' },
    h('label', { for: id }, rotulo),
    input,
    dica ? h('small', { class: 'dica' }, dica) : null,
  );
  return { raiz, input };
}

/**
 * Lista suspensa com rótulo. `opcoes` é [{ valor, rotulo }]. Retorna { raiz, select }.
 */
export function selecao({ id, rotulo, opcoes, valor = '', dica }) {
  const select = seletor({ id, rotulo, opcoes, valor });
  const raiz = h(
    'div',
    { class: 'campo' },
    h('label', { for: id }, rotulo),
    select,
    dica ? h('small', { class: 'dica' }, dica) : null,
  );
  return { raiz, select };
}

/** Área de mensagem de erro/aviso com role="alert". */
export function areaMensagem() {
  const el = h('p', { class: 'mensagem', role: 'alert', hidden: true });
  return {
    el,
    mostrar(texto, tipo = 'erro') {
      el.textContent = texto;
      el.className = `mensagem mensagem-${tipo}`;
      el.hidden = false;
    },
    limpar() {
      el.hidden = true;
      el.textContent = '';
    },
  };
}

/**
 * Executa uma ação assíncrona travando o botão e exibindo o erro na área de mensagem.
 * @returns {Promise<boolean>} true se a ação terminou sem erro
 */
export async function executarComBotao(botao, mensagem, acao, textoCarregando = 'Aguarde…') {
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoCarregando;
  mensagem.limpar();
  try {
    await acao();
    return true;
  } catch (err) {
    mensagem.mostrar(err.message || 'Não foi possível concluir a operação.');
    return false;
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}
