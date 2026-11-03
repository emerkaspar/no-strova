import { cadastrar, entrar } from '../../application/sessao.js';
import { SENHA_MINIMA } from '../../core/constants.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { logo } from '../../utils/marca.js';
import { definirModo, estadoAuth } from './state.js';
import { TEXTO_ACEITE_LGPD } from './textos.js';

function formularioEntrar(aoTrocar) {
  const email = campo({ id: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email', required: true });
  const senha = campo({ id: 'senha', rotulo: 'Senha', tipo: 'password', autocomplete: 'current-password', required: true });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn btn-bloco', type: 'submit' }, 'Entrar');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, () => entrar(email.input.value.trim(), senha.input.value));
      },
    },
    email.raiz,
    senha.raiz,
    mensagem.el,
    botao,
  );

  return h(
    'div',
    null,
    h('h1', null, 'Entrar'),
    form,
    h(
      'p',
      { class: 'alternar' },
      'Ainda não tem conta? ',
      h('button', { class: 'btn-link', type: 'button', onClick: () => aoTrocar('criar') }, 'Criar conta'),
    ),
  );
}

function formularioCriar(aoTrocar) {
  const nome = campo({ id: 'nome', rotulo: 'Nome', autocomplete: 'name', required: true, maxlength: 80 });
  const email = campo({ id: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email', required: true });
  const senha = campo({
    id: 'senha',
    rotulo: 'Senha',
    tipo: 'password',
    autocomplete: 'new-password',
    required: true,
    dica: `Mínimo de ${SENHA_MINIMA} caracteres.`,
  });
  const nascimento = campo({
    id: 'nascimento',
    rotulo: 'Data de nascimento (opcional)',
    tipo: 'date',
    autocomplete: 'bday',
    dica: 'Usada para estimar o gasto calórico.',
  });
  const aceite = h('input', { id: 'aceite', type: 'checkbox' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn btn-bloco', type: 'submit' }, 'Criar conta');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, () =>
          cadastrar({
            nome: nome.input.value,
            email: email.input.value.trim(),
            senha: senha.input.value,
            dataNascimento: nascimento.input.value,
            aceite: aceite.checked,
          }),
        );
      },
    },
    nome.raiz,
    email.raiz,
    senha.raiz,
    nascimento.raiz,
    h('div', { class: 'aceite' }, aceite, h('label', { for: 'aceite' }, TEXTO_ACEITE_LGPD)),
    mensagem.el,
    botao,
  );

  return h(
    'div',
    null,
    h('h1', null, 'Criar conta'),
    h('p', { class: 'texto-secundario' }, 'Depois de criar a conta, um administrador precisa aprovar o seu acesso.'),
    form,
    h(
      'p',
      { class: 'alternar' },
      'Já tem conta? ',
      h('button', { class: 'btn-link', type: 'button', onClick: () => aoTrocar('entrar') }, 'Entrar'),
    ),
  );
}

export function render(raiz) {
  const cartao = h('div', { class: 'card' });
  raiz.replaceChildren(h('main', { class: 'centralizado' }, cartao));

  function desenhar() {
    const aoTrocar = (modo) => {
      definirModo(modo);
      desenhar();
    };
    cartao.replaceChildren(
      logo({ grande: true }),
      estadoAuth.modo === 'criar' ? formularioCriar(aoTrocar) : formularioEntrar(aoTrocar),
    );
  }

  desenhar();
  return () => {};
}
