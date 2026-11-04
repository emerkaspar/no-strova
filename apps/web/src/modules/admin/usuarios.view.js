import { PAPEIS, PAPEIS_ATRIBUIVEIS, RECURSOS, RECURSOS_PADRAO, ROTULOS_RECURSOS } from '@no-strova/domain';
import {
  aprovarUsuario,
  atualizarUsuarioAdmin,
  bloquearUsuario,
  criarUsuarioAdmin,
  excluirUsuarioAdmin,
  listarUsuarios,
} from '../../core/functions.js';
import { SENHA_MINIMA } from '../../core/constants.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarDataHora } from '../../utils/formatters.js';
import { alternarOrdemUsuarios, estadoUsuarios } from './state.js';

const ROTULO_PAPEL = { [PAPEIS.ADMIN]: 'Administrador', [PAPEIS.ATLETA]: 'Atleta', [PAPEIS.TREINADOR]: 'Treinador' };

const COLUNAS = [
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'email', rotulo: 'E-mail' },
  { campo: 'role', rotulo: 'Papel' },
  { campo: 'situacao', rotulo: 'Situação' },
  { campo: 'criadoEm', rotulo: 'Cadastro' },
];

const situacaoDe = (u) => (!u.ativo ? 'Bloqueado' : !u.aprovado ? 'Pendente' : 'Ativo');

function filtrarEOrdenar(usuarios) {
  const termo = estadoUsuarios.busca.trim().toLowerCase();
  const { campo: chave, direcao } = estadoUsuarios.ordem;
  const fator = direcao === 'asc' ? 1 : -1;
  const valor = (u) => (chave === 'situacao' ? situacaoDe(u) : (u[chave] ?? ''));
  return usuarios
    .filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * fator;
      return String(va).localeCompare(String(vb), 'pt-BR') * fator;
    });
}

/** Caixas de seleção dos recursos (IA, Garmin). `ler()` devolve o objeto { ia, garmin } marcado. */
function caixasDeRecursos(inicial) {
  const caixas = Object.values(RECURSOS).map((chave) => {
    const input = h('input', { type: 'checkbox', id: `usr-rec-${chave}`, checked: inicial[chave] === true });
    return { chave, input, el: h('label', { class: 'ia-sem-limite', for: `usr-rec-${chave}` }, input, ` ${ROTULOS_RECURSOS[chave]}`) };
  });
  return {
    el: h('div', { class: 'campo' }, h('span', { class: 'ia-rotulo' }, 'Funcionalidades liberadas'), ...caixas.map((c) => c.el)),
    ler: () => Object.fromEntries(caixas.map((c) => [c.chave, c.input.checked])),
  };
}

/**
 * Aba "Usuários" (só admin): lista com busca e ordenação, criação, edição, bloqueio, aprovação e exclusão. As
 * funcionalidades (IA, Garmin) se liberam ou retiram direto na linha. Tudo passa por callables do admin.
 * @returns {() => void} limpa a aba ao sair
 */
export function render(raiz, { uid: meuUid }) {
  let usuarios = [];
  let ativa = true;
  const mensagem = areaMensagem();
  const areaForm = h('div');
  const corpoTabela = h('div', { class: 'tabela-wrap' });
  const busca = h('input', {
    type: 'search',
    placeholder: 'Buscar por nome ou e-mail',
    'aria-label': 'Buscar por nome ou e-mail',
    value: estadoUsuarios.busca,
    onInput: (e) => {
      estadoUsuarios.busca = e.target.value;
      desenharTabela();
    },
  });

  async function recarregar() {
    const resposta = await listarUsuarios();
    if (!ativa) return;
    usuarios = resposta.usuarios;
    desenharTabela();
  }

  /** Roda uma ação do admin, recarrega a lista e mostra o erro, se houver. */
  async function agir(botoes, acao) {
    mensagem.limpar();
    botoes.forEach((b) => (b.disabled = true));
    try {
      await acao();
      await recarregar();
    } catch (err) {
      mensagem.mostrar(err.message);
    } finally {
      botoes.forEach((b) => (b.disabled = false));
    }
  }

  function abrirForm(usuario = null) {
    const edicao = usuario !== null;
    const msg = areaMensagem();
    const nome = campo({ id: 'usr-nome', rotulo: 'Nome', maxlength: 80, value: usuario?.nome ?? '' });
    const email = campo({ id: 'usr-email', rotulo: 'E-mail', tipo: 'email', value: usuario?.email ?? '', disabled: edicao, autocomplete: 'off' });
    const senha = campo({
      id: 'usr-senha',
      rotulo: 'Senha temporária',
      tipo: 'text',
      autocomplete: 'off',
      dica: `Mínimo de ${SENHA_MINIMA} caracteres. Passe para a pessoa; ela deve trocar depois do primeiro acesso.`,
    });
    const papel = selecao({
      id: 'usr-papel',
      rotulo: 'Papel',
      valor: usuario?.role ?? PAPEIS.ATLETA,
      opcoes: PAPEIS_ATRIBUIVEIS.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] })),
    });
    const ehAdmin = usuario?.role === PAPEIS.ADMIN;
    const recursos = caixasDeRecursos(usuario?.recursos ?? RECURSOS_PADRAO);
    const botao = h('button', { class: 'btn', type: 'submit' }, edicao ? 'Salvar' : 'Criar usuário');

    const form = h(
      'form',
      {
        novalidate: true,
        class: 'peso-form',
        onSubmit: (e) => {
          e.preventDefault();
          executarComBotao(botao, msg, async () => {
            if (edicao) {
              await atualizarUsuarioAdmin({
                uid: usuario.uid,
                ...(ehAdmin ? {} : { nome: nome.input.value, role: papel.select.value }),
                recursos: recursos.ler(),
              });
            } else {
              await criarUsuarioAdmin({
                nome: nome.input.value,
                email: email.input.value,
                senha: senha.input.value,
                role: papel.select.value,
                recursos: recursos.ler(),
              });
            }
            areaForm.replaceChildren();
            await recarregar();
          });
        },
      },
      nome.raiz,
      email.raiz,
      edicao ? null : senha.raiz,
      papel.raiz,
      recursos.el,
      msg.el,
      h(
        'div',
        { class: 'linha-botoes' },
        botao,
        h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => areaForm.replaceChildren() }, 'Cancelar'),
      ),
    );
    if (ehAdmin) {
      nome.input.disabled = true;
      papel.select.disabled = true;
    }
    areaForm.replaceChildren(h('section', { class: 'card' }, h('h2', null, edicao ? `Editar ${usuario.nome || usuario.email}` : 'Novo usuário'), form));
    nome.input.focus();
  }

  /** Marca ou desmarca um recurso na própria linha e salva na hora. */
  function alternarRecurso(u, chave, input) {
    const novos = { ...u.recursos, [chave]: input.checked };
    agir([input], async () => {
      await atualizarUsuarioAdmin({ uid: u.uid, recursos: novos });
    }).then(() => {
      // se a ação falhou, a lista não foi recarregada: volta a caixa ao valor que o servidor tem
      input.checked = (usuarios.find((x) => x.uid === u.uid)?.recursos ?? u.recursos)[chave];
    });
  }

  function linha(u) {
    const ehEu = u.uid === meuUid;
    const ehAdmin = u.role === PAPEIS.ADMIN;
    const caixa = (chave) => {
      const input = h('input', { type: 'checkbox', checked: u.recursos[chave] === true, 'aria-label': `${ROTULOS_RECURSOS[chave]} para ${u.nome || u.email}` });
      input.addEventListener('change', () => alternarRecurso(u, chave, input));
      return h('td', null, input);
    };
    const botoes = [];
    const novoBotao = (rotulo, classe, aoClicar) => {
      const b = h('button', { class: classe, type: 'button' }, rotulo);
      b.addEventListener('click', aoClicar);
      botoes.push(b);
      return b;
    };
    const acoes = [novoBotao('Editar', 'btn btn-secundario', () => abrirForm(u))];
    if (!ehAdmin) {
      if (!u.aprovado && u.ativo) acoes.push(novoBotao('Aprovar', 'btn', () => agir(botoes, () => aprovarUsuario({ uid: u.uid, aprovado: true }))));
      if (u.ativo) {
        acoes.push(
          novoBotao('Bloquear', 'btn btn-perigo', () => {
            if (confirm(`Bloquear o acesso de ${u.nome || u.email}?`)) agir(botoes, () => bloquearUsuario({ uid: u.uid, ativo: false }));
          }),
        );
      } else {
        acoes.push(novoBotao('Liberar', 'btn', () => agir(botoes, () => bloquearUsuario({ uid: u.uid, ativo: true }))));
      }
      acoes.push(
        novoBotao('Excluir', 'btn btn-perigo', () => {
          if (!confirm(`Excluir ${u.nome || u.email} e TODOS os dados dessa pessoa (atividades, metas, arquivos)? Isso não pode ser desfeito.`)) return;
          agir(botoes, () => excluirUsuarioAdmin({ uid: u.uid }));
        }),
      );
    }
    return h(
      'tr',
      null,
      h('td', null, (u.nome || '—') + (ehEu ? ' (você)' : '')),
      h('td', null, u.email),
      h('td', null, ROTULO_PAPEL[u.role] ?? u.role),
      h('td', null, situacaoDe(u)),
      h('td', null, u.criadoEm ? formatarDataHora(u.criadoEm) : '—'),
      caixa(RECURSOS.IA),
      caixa(RECURSOS.GARMIN),
      h('td', null, h('div', { class: 'acoes' }, ...acoes)),
    );
  }

  function desenharTabela() {
    const lista = filtrarEOrdenar([...usuarios]);
    if (lista.length === 0) {
      corpoTabela.replaceChildren(h('p', { class: 'vazio' }, usuarios.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum resultado para a busca.'));
      return;
    }
    const { campo: ordenado, direcao } = estadoUsuarios.ordem;
    const cabecalho = COLUNAS.map((c) =>
      h(
        'th',
        { scope: 'col', 'aria-sort': c.campo === ordenado ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              alternarOrdemUsuarios(c.campo);
              desenharTabela();
            },
          },
          c.rotulo + (c.campo === ordenado ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''),
        ),
      ),
    );
    corpoTabela.replaceChildren(
      h(
        'table',
        { class: 'tabela' },
        h(
          'thead',
          null,
          h('tr', null, ...cabecalho, h('th', { scope: 'col', title: ROTULOS_RECURSOS[RECURSOS.IA] }, 'IA'), h('th', { scope: 'col', title: ROTULOS_RECURSOS[RECURSOS.GARMIN] }, 'Garmin'), h('th', { scope: 'col' }, 'Ações')),
        ),
        h('tbody', null, ...lista.map(linha)),
      ),
    );
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'pilha' },
      areaForm,
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Usuários'),
        h('p', { class: 'texto-secundario' }, 'Crie, edite, bloqueie ou exclua contas e libere ou retire funcionalidades por usuário. Novos usuários nascem com IA ligada e Garmin desligado.'),
        h('div', { class: 'barra-tabela' }, busca, h('button', { class: 'btn', type: 'button', onClick: () => abrirForm() }, 'Novo usuário')),
        mensagem.el,
        corpoTabela,
      ),
    ),
  );
  corpoTabela.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
  recarregar().catch((err) => {
    if (!ativa) return;
    corpoTabela.replaceChildren();
    mensagem.mostrar(err.message);
  });

  return () => {
    ativa = false;
  };
}
