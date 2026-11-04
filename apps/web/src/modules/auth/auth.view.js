import { cadastrar, entrar, entrarComGoogle } from '../../application/sessao.js';
import { SENHA_MINIMA } from '../../core/constants.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { logoCompleto } from '../../utils/marca.js';
import { definirModo, estadoAuth } from './state.js';
import { TEXTO_ACEITE_LGPD } from './textos.js';

function formularioEntrar(google) {
  const email = campo({
    id: 'email',
    rotulo: 'E-mail',
    tipo: 'email',
    autocomplete: 'email',
    required: true,
    placeholder: 'voce@email.com',
  });
  const senha = campo({
    id: 'senha',
    rotulo: 'Senha',
    tipo: 'password',
    autocomplete: 'current-password',
    required: true,
    placeholder: '••••••••',
  });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn btn-bloco', type: 'submit' }, 'Ir treinar');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, () => entrar(email.input.value.trim(), senha.input.value), 'Entrando...');
      },
    },
    email.raiz,
    senha.raiz,
    botao,
    mensagem.el,
  );

  return h('div', { class: 'acesso-form' }, h('h2', null, 'Entra aí'), google, form);
}

function formularioCriar(google) {
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
    botao,
    mensagem.el,
  );

  return h(
    'div',
    { class: 'acesso-form' },
    h('h2', null, 'Criar conta'),
    h('p', { class: 'acesso-nota' }, 'Depois de criar a conta, um administrador precisa aprovar o seu acesso.'),
    google,
    form,
  );
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Logo "G" do Google (cores oficiais), desenhado sem innerHTML. */
function iconeGoogle() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const partes = [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ];
  for (const [cor, d] of partes) {
    const caminho = document.createElementNS(SVG_NS, 'path');
    caminho.setAttribute('fill', cor);
    caminho.setAttribute('d', d);
    svg.append(caminho);
  }
  return svg;
}

function blocoGoogle(rotulo) {
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn-google', type: 'button' });
  const rotuloEl = h('span', null, rotulo);
  botao.append(iconeGoogle(), rotuloEl);
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    rotuloEl.textContent = 'Aguarde…';
    mensagem.limpar();
    try {
      await entrarComGoogle();
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível entrar com o Google.');
    } finally {
      botao.disabled = false;
      rotuloEl.textContent = rotulo;
    }
  });
  return h(
    'div',
    { class: 'google-bloco' },
    botao,
    mensagem.el,
    h('div', { class: 'divisor' }, h('span', null, 'ou com e-mail')),
  );
}

function painelApresentacao() {
  return h(
    'section',
    { class: 'acesso-hero' },
    h(
      'h1',
      { class: 'acesso-titulo' },
      h('span', null, 'Sem fotinho.'),
      h('span', null, 'Sem plateia.'),
      h('span', { class: 'acesso-titulo-ultima' }, 'Só o treino.'),
    ),
    h(
      'p',
      { class: 'acesso-texto' },
      'Um app de treino que não pede foto, não pede legenda e não vai te chamar de guerreiro.',
    ),
  );
}

export function render(raiz) {
  const cartao = h('div', { class: 'card' });
  const alternar = h('button', { class: 'acesso-alternar', type: 'button' });
  const pergunta = h('span');
  const topo = h(
    'header',
    { class: 'acesso-topo' },
    h('div', { class: 'acesso-marca' }, logoCompleto()),
    h('p', { class: 'acesso-troca' }, pergunta, ' ', alternar),
  );
  raiz.replaceChildren(h('main', { class: 'acesso' }, topo, h('div', { class: 'acesso-corpo' }, painelApresentacao(), cartao)));

  function desenhar() {
    const criando = estadoAuth.modo === 'criar';
    const google = blocoGoogle(criando ? 'Cadastrar com o Google' : 'Entrar com o Google');
    cartao.replaceChildren(criando ? formularioCriar(google) : formularioEntrar(google));
    pergunta.textContent = criando ? 'Já tem conta?' : 'Sem conta?';
    alternar.textContent = criando ? 'Entrar' : 'Criar uma';
  }

  alternar.addEventListener('click', () => {
    definirModo(estadoAuth.modo === 'criar' ? 'entrar' : 'criar');
    desenhar();
  });

  desenhar();
  return () => {};
}
