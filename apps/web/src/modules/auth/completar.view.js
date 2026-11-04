import { completarCadastro, sair } from '../../application/sessao.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { logo } from '../../utils/marca.js';
import { TEXTO_ACEITE_LGPD } from './textos.js';

/** Para quem tem conta, mas não concluiu o perfil ou o aceite LGPD. */
export function render(raiz, sessao) {
  const nome = campo({
    id: 'nome',
    rotulo: 'Nome',
    autocomplete: 'name',
    required: true,
    maxlength: 80,
    value: sessao.perfil?.nome || sessao.nomeSugerido || '',
  });
  const nascimento = campo({
    id: 'nascimento',
    rotulo: 'Data de nascimento (opcional)',
    tipo: 'date',
    autocomplete: 'bday',
    value: sessao.perfil?.dataNascimento ?? '',
  });
  const aceite = h('input', { id: 'aceite', type: 'checkbox' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn btn-bloco', type: 'submit' }, 'Concluir cadastro');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, () =>
          completarCadastro({
            nome: nome.input.value,
            dataNascimento: nascimento.input.value,
            aceite: aceite.checked,
          }),
        );
      },
    },
    nome.raiz,
    nascimento.raiz,
    h('div', { class: 'aceite' }, aceite, h('label', { for: 'aceite' }, TEXTO_ACEITE_LGPD)),
    mensagem.el,
    botao,
  );

  raiz.replaceChildren(
    h(
      'main',
      { class: 'centralizado' },
      h(
        'div',
        { class: 'card' },
        logo({ grande: true }),
        h('h1', null, 'Falta pouco'),
        h('p', { class: 'texto-secundario' }, `Conclua o cadastro de ${sessao.email ?? 'sua conta'} para continuar.`),
        form,
        h('p', { class: 'alternar' }, h('button', { class: 'btn-link', type: 'button', onClick: sair }, 'Sair')),
      ),
    ),
  );
  return () => {};
}
