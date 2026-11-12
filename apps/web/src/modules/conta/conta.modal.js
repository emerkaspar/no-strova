import { lerAvatar, PERSONAGENS } from '@no-strova/domain';
import { alterarSenha, aoMudarSessao, contaTemSenha, obterSessao } from '../../application/sessao.js';
import { removerFoto, salvarDadosPessoais, usarFoto, usarPersonagem } from '../../application/conta.js';
import { SENHA_MINIMA } from '../../core/constants.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { avatarDe } from '../../utils/avatar.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { abrirModal, confirmar } from '../../utils/modal.js';
import { desenhoDoPersonagem } from '../../utils/personagens.js';

/** Seção de avatar: pré-visualização, enviar foto e a grade de personagens. */
function secaoAvatar() {
  const mensagem = areaMensagem();
  const previa = avatarDe('conta-previa');
  previa.atualizar(obterSessao());
  const entrada = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Escolher foto' });
  const botaoFoto = h('button', { class: 'btn btn-secundario', type: 'button' }, icone('camera', 18), 'Enviar foto');
  const botaoRemover = h('button', { class: 'btn btn-secundario', type: 'button', hidden: true }, icone('lixeira', 18), 'Remover foto');
  const grade = h('div', { class: 'conta-personagens', role: 'group', 'aria-label': 'Personagens' });

  const botoesPersonagem = PERSONAGENS.map((p) => {
    const miniatura = h('span', { class: 'conta-personagem-img' }, desenhoDoPersonagem(p.id, p.fundo));
    const b = h('button', { class: 'conta-personagem', type: 'button', 'aria-pressed': 'false', title: p.nome, 'data-id': p.id }, miniatura, h('span', { class: 'conta-personagem-nome' }, p.nome));
    b.addEventListener('click', () => trocar(() => usarPersonagem(obterSessao().uid, p.id), b));
    return b;
  });
  grade.append(...botoesPersonagem);

  async function trocar(acao, botao) {
    const todos = [botaoFoto, botaoRemover, ...botoesPersonagem];
    mensagem.limpar();
    todos.forEach((b) => (b.disabled = true));
    botao?.classList.add('carregando');
    try {
      await acao();
    } catch (err) {
      mensagem.mostrar(err?.message || 'Não foi possível trocar o avatar. Tente de novo.');
    } finally {
      todos.forEach((b) => (b.disabled = false));
      botao?.classList.remove('carregando');
    }
  }

  botaoFoto.addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', () => {
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    if (arquivo) trocar(() => usarFoto(obterSessao().uid, arquivo), botaoFoto);
  });

  botaoRemover.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Remover a foto?', mensagem: 'O seu avatar volta ao personagem padrão. Você pode enviar outra foto quando quiser.', tipo: 'aviso', icone: 'lixeira', confirmarTexto: 'Remover' });
    if (ok) trocar(() => removerFoto(obterSessao().uid), botaoRemover);
  });

  function atualizar(sessao) {
    previa.atualizar(sessao);
    const atual = lerAvatar(sessao.perfil?.avatar);
    botaoRemover.hidden = atual.tipo !== 'foto';
    for (const b of botoesPersonagem) b.setAttribute('aria-pressed', String(atual.tipo === 'personagem' && atual.id === b.dataset.id));
  }

  const raiz = h(
    'section',
    { class: 'conta-secao', 'aria-labelledby': 'conta-avatar-titulo' },
    h('h3', { id: 'conta-avatar-titulo', class: 'conta-secao-titulo' }, 'Foto de perfil'),
    h(
      'div',
      { class: 'conta-avatar-linha' },
      previa.el,
      h('div', { class: 'conta-avatar-acoes' }, h('p', { class: 'dica' }, 'Envie uma foto sua (ela é recortada em quadrado) ou escolha um personagem abaixo.'), h('div', { class: 'conta-botoes' }, botaoFoto, botaoRemover), entrada),
    ),
    grade,
    mensagem.el,
  );
  return { raiz, atualizar };
}

/** Seção de nome e data de nascimento. */
function secaoDados(sessao) {
  const nome = campo({ id: 'conta-nome', rotulo: 'Nome', autocomplete: 'name', required: true, maxlength: 80, value: sessao.perfil?.nome ?? '' });
  const nascimento = campo({ id: 'conta-nascimento', rotulo: 'Data de nascimento', tipo: 'date', autocomplete: 'bday', value: sessao.perfil?.dataNascimento ?? '' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Salvar dados');
  const form = h(
    'form',
    {
      class: 'conta-form',
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        const ok = await executarComBotao(
          botao,
          mensagem,
          () => salvarDadosPessoais(obterSessao().uid, { nome: nome.input.value, dataNascimento: nascimento.input.value }),
          'Salvando…',
        );
        if (ok) mensagem.mostrar('Dados salvos.', 'ok');
      },
    },
    nome.raiz,
    nascimento.raiz,
    mensagem.el,
    botao,
  );
  return h('section', { class: 'conta-secao', 'aria-labelledby': 'conta-dados-titulo' }, h('h3', { id: 'conta-dados-titulo', class: 'conta-secao-titulo' }, 'Dados pessoais'), form);
}

/** Seção de troca de senha (só para quem entra com e-mail e senha). */
function secaoSenha() {
  const titulo = h('h3', { id: 'conta-senha-titulo', class: 'conta-secao-titulo' }, 'Alterar senha');
  if (!contaTemSenha()) {
    return h('section', { class: 'conta-secao', 'aria-labelledby': 'conta-senha-titulo' }, titulo, h('p', { class: 'dica' }, 'Você entra com a conta do Google, então a senha é gerenciada por lá.'));
  }
  const atual = campo({ id: 'conta-senha-atual', rotulo: 'Senha atual', tipo: 'password', autocomplete: 'current-password', required: true });
  const nova = campo({ id: 'conta-senha-nova', rotulo: 'Nova senha', tipo: 'password', autocomplete: 'new-password', required: true, dica: `Ao menos ${SENHA_MINIMA} caracteres.` });
  const confirmacao = campo({ id: 'conta-senha-confirmacao', rotulo: 'Repita a nova senha', tipo: 'password', autocomplete: 'new-password', required: true });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Alterar senha');
  const form = h(
    'form',
    {
      class: 'conta-form',
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        const ok = await executarComBotao(
          botao,
          mensagem,
          () => alterarSenha({ senhaAtual: atual.input.value, novaSenha: nova.input.value, confirmacao: confirmacao.input.value }),
          'Alterando…',
        );
        if (ok) {
          form.reset();
          mensagem.mostrar('Senha alterada.', 'ok');
        }
      },
    },
    atual.raiz,
    nova.raiz,
    confirmacao.raiz,
    mensagem.el,
    botao,
  );
  return h('section', { class: 'conta-secao', 'aria-labelledby': 'conta-senha-titulo' }, titulo, form);
}

/** Abre o editor da conta: foto ou personagem, nome, data de nascimento e senha. */
export async function abrirConta() {
  let parar = () => {};
  try {
    await abrirModal({
      classe: 'modal-conta',
      rotulo: 'Minha conta',
      conteudo: (fechar) => {
        const avatar = secaoAvatar();
        parar = aoMudarSessao((s) => avatar.atualizar(s));
        return h(
          'div',
          { class: 'conta' },
          h('header', { class: 'conta-topo' }, h('h2', { class: 'conta-titulo' }, 'Minha conta'), h('button', { class: 'btn-icone', type: 'button', 'aria-label': 'Fechar', onClick: () => fechar() }, icone('fechar', 20))),
          h('div', { class: 'conta-corpo' }, avatar.raiz, secaoDados(obterSessao()), secaoSenha()),
        );
      },
    });
  } finally {
    parar();
  }
}
