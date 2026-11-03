import { aprovarUsuario, bloquearUsuario, listarPendentes } from '../../core/functions.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarDataHora } from '../../utils/formatters.js';
import { alternarOrdem, estadoAprovacoes } from './state.js';

const COLUNAS = [
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'email', rotulo: 'E-mail' },
  { campo: 'criadoEm', rotulo: 'Cadastro' },
];

function filtrarEOrdenar(usuarios) {
  const termo = estadoAprovacoes.busca.trim().toLowerCase();
  const { campo, direcao } = estadoAprovacoes.ordem;
  const fator = direcao === 'asc' ? 1 : -1;
  return usuarios
    .filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => {
      const va = a[campo] ?? '';
      const vb = b[campo] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * fator;
      return String(va).localeCompare(String(vb), 'pt-BR') * fator;
    });
}

export function render(raiz) {
  let usuarios = [];
  let ativa = true;
  const mensagem = areaMensagem();
  const corpoTabela = h('div', { class: 'tabela-wrap' });
  const busca = h('input', {
    type: 'search',
    placeholder: 'Buscar por nome ou e-mail',
    'aria-label': 'Buscar por nome ou e-mail',
    value: estadoAprovacoes.busca,
    onInput: (e) => {
      estadoAprovacoes.busca = e.target.value;
      desenharTabela();
    },
  });

  async function agir(botoes, acao) {
    mensagem.limpar();
    botoes.forEach((b) => (b.disabled = true));
    try {
      await acao();
    } catch (err) {
      mensagem.mostrar(err.message);
      botoes.forEach((b) => (b.disabled = false));
    }
  }

  function linha(u) {
    const aprovar = h('button', { class: 'btn', type: 'button' }, 'Aprovar');
    const bloquear = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Bloquear');
    const botoes = [aprovar, bloquear];
    aprovar.addEventListener('click', () =>
      agir(botoes, async () => {
        await aprovarUsuario({ uid: u.uid, aprovado: true });
        usuarios = usuarios.filter((x) => x.uid !== u.uid);
        if (ativa) desenharTabela();
      }),
    );
    bloquear.addEventListener('click', () => {
      if (!confirm(`Bloquear o acesso de ${u.nome || u.email}?`)) return;
      agir(botoes, async () => {
        await bloquearUsuario({ uid: u.uid, ativo: false });
        usuarios = usuarios.filter((x) => x.uid !== u.uid);
        if (ativa) desenharTabela();
      });
    });
    return h(
      'tr',
      null,
      h('td', null, u.nome || '—'),
      h('td', null, u.email),
      h('td', null, formatarDataHora(u.criadoEm)),
      h('td', null, h('div', { class: 'acoes' }, aprovar, bloquear)),
    );
  }

  function desenharTabela() {
    const lista = filtrarEOrdenar([...usuarios]);
    if (lista.length === 0) {
      corpoTabela.replaceChildren(
        h('p', { class: 'vazio' }, usuarios.length === 0 ? 'Nenhum cadastro aguardando aprovação.' : 'Nenhum resultado para a busca.'),
      );
      return;
    }
    const { campo, direcao } = estadoAprovacoes.ordem;
    const cabecalho = COLUNAS.map((c) =>
      h(
        'th',
        { scope: 'col', 'aria-sort': c.campo === campo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              alternarOrdem(c.campo);
              desenharTabela();
            },
          },
          c.rotulo + (c.campo === campo ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''),
        ),
      ),
    );
    corpoTabela.replaceChildren(
      h(
        'table',
        { class: 'tabela' },
        h('thead', null, h('tr', null, ...cabecalho, h('th', { scope: 'col' }, 'Ações'))),
        h('tbody', null, ...lista.map(linha)),
      ),
    );
  }

  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, 'Aprovações'),
      h('p', { class: 'texto-secundario' }, 'Cadastros que concluíram o aceite e aguardam liberação de acesso.'),
      h('div', { class: 'barra-tabela' }, busca),
      mensagem.el,
      corpoTabela,
    ),
  );
  corpoTabela.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  listarPendentes()
    .then((resposta) => {
      if (!ativa) return;
      usuarios = resposta.usuarios;
      desenharTabela();
    })
    .catch((err) => {
      if (!ativa) return;
      corpoTabela.replaceChildren();
      mensagem.mostrar(err.message);
    });

  return () => {
    ativa = false;
  };
}
