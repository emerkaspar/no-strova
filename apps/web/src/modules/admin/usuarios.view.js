import { PAPEIS, PAPEIS_ATRIBUIVEIS, RECURSOS, ROTULOS_RECURSOS } from '@no-strova/domain';
import { SENHA_MINIMA } from '../../core/constants.js';
import {
  aprovarUsuario,
  atualizarUsuarioAdmin,
  bloquearUsuario,
  criarUsuarioAdmin,
  excluirUsuarioAdmin,
  listarUsuarios,
} from '../../core/functions.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { abrirModalRecursos, listaDeRecursos } from './recursos.js';
import { alternarOrdemUsuarios, estadoUsuarios } from './state.js';
import { confirmar } from '../../utils/modal.js';

const ROTULO_PAPEL = { [PAPEIS.ADMIN]: 'Administrador', [PAPEIS.ATLETA]: 'Atleta', [PAPEIS.TREINADOR]: 'Treinador' };
const ABREVIACAO_RECURSO = { [RECURSOS.IA]: 'IA', [RECURSOS.GARMIN]: 'Garmin' };

const COLUNAS = [
  { campo: 'nome', rotulo: 'Usuário' },
  { campo: 'role', rotulo: 'Papel' },
  { campo: 'situacao', rotulo: 'Situação' },
  { campo: 'criadoEm', rotulo: 'Cadastro' },
];

const situacaoDe = (u) => (!u.ativo ? 'Bloqueado' : !u.aprovado ? 'Pendente' : 'Ativo');
const VARIANTE_SITUACAO = { Ativo: 'selo-ok', Pendente: 'selo-aviso', Bloqueado: 'selo-perigo' };
const inicialDe = (u) => (u.nome || u.email || '?').trim().charAt(0).toUpperCase();
const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

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

/** Botão quadrado só com ícone; o rótulo vai em `title` e `aria-label`. `variante`: '', 'perigo' ou 'ok'. */
function botaoIcone({ nome, rotulo, variante = '', aoClicar }) {
  const b = h('button', { class: `btn-icone${variante ? ` btn-icone-${variante}` : ''}`, type: 'button', title: rotulo, 'aria-label': rotulo }, icone(nome, 18));
  b.addEventListener('click', aoClicar);
  return b;
}

/**
 * Aba "Usuários" (só admin): lista com busca e ordenação, criação, edição, aprovação, bloqueio e exclusão. As
 * funcionalidades de cada pessoa (IA, Garmin…) abrem num modal com interruptores. Tudo passa por callables do admin.
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

  /** Formulário de criação (usuario = null) ou de edição de nome e papel. */
  function abrirForm(usuario = null) {
    const edicao = usuario !== null;
    const msg = areaMensagem();
    const nome = campo({ id: 'usr-nome', rotulo: 'Nome', maxlength: 80, value: usuario?.nome ?? '' });
    const email = campo({ id: 'usr-email', rotulo: 'E-mail', tipo: 'email', value: usuario?.email ?? '', disabled: edicao, autocomplete: 'off' });
    const senha = campo({
      id: 'usr-senha',
      rotulo: 'Senha temporária',
      autocomplete: 'off',
      dica: `Mínimo de ${SENHA_MINIMA} caracteres. Passe para a pessoa; ela deve trocar depois do primeiro acesso.`,
    });
    const papel = selecao({
      id: 'usr-papel',
      rotulo: 'Papel',
      valor: usuario?.role ?? PAPEIS.ATLETA,
      opcoes: PAPEIS_ATRIBUIVEIS.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] })),
    });
    const recursos = edicao ? null : listaDeRecursos(undefined, 'usr-rec');
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
              await atualizarUsuarioAdmin({ uid: usuario.uid, nome: nome.input.value, role: papel.select.value });
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
      recursos ? h('div', { class: 'campo' }, h('span', { class: 'ia-rotulo' }, 'Funcionalidades liberadas'), recursos.el) : null,
      msg.el,
      h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => areaForm.replaceChildren() }, 'Cancelar')),
    );
    areaForm.replaceChildren(h('section', { class: 'card' }, h('h2', null, edicao ? `Editar ${usuario.nome || usuario.email}` : 'Novo usuário'), form));
    nome.input.focus();
  }

  function linha(u) {
    const ehEu = u.uid === meuUid;
    const ehAdmin = u.role === PAPEIS.ADMIN;
    const acoes = [];
    const botoes = acoes; // `agir` trava todos os botões da linha enquanto roda
    const add = (b) => {
      acoes.push(b);
      return b;
    };

    if (!ehAdmin) add(botaoIcone({ nome: 'lapis', rotulo: 'Editar nome e papel', aoClicar: () => abrirForm(u) }));
    add(botaoIcone({ nome: 'recursos', rotulo: 'Funcionalidades', aoClicar: () => abrirModalRecursos(u, recarregar) }));
    if (!ehAdmin) {
      if (!u.aprovado && u.ativo) {
        add(botaoIcone({ nome: 'ok', rotulo: 'Aprovar acesso', variante: 'ok', aoClicar: () => agir(botoes, () => aprovarUsuario({ uid: u.uid, aprovado: true })) }));
      }
      if (u.ativo) {
        add(
          botaoIcone({
            nome: 'bloquear',
            rotulo: 'Bloquear acesso',
            variante: 'perigo',
            aoClicar: async () =>
              (await confirmar({ titulo: 'Bloquear acesso?', mensagem: `${u.nome || u.email} não vai conseguir usar o sistema até ser desbloqueado.`, confirmarTexto: 'Bloquear', tipo: 'perigo', icone: 'bloquear' })) &&
              agir(botoes, () => bloquearUsuario({ uid: u.uid, ativo: false })),
          }),
        );
      } else {
        add(botaoIcone({ nome: 'desbloquear', rotulo: 'Liberar acesso', variante: 'ok', aoClicar: () => agir(botoes, () => bloquearUsuario({ uid: u.uid, ativo: true })) }));
      }
      add(
        botaoIcone({
          nome: 'lixeira',
          rotulo: 'Excluir usuário',
          variante: 'perigo',
          aoClicar: async () =>
            (await confirmar({ titulo: 'Excluir usuário?', mensagem: `${u.nome || u.email} e TODOS os dados dessa pessoa (atividades, metas, arquivos) serão apagados. Isso não pode ser desfeito.`, confirmarTexto: 'Excluir tudo', tipo: 'perigo', icone: 'lixeira' })) &&
            agir(botoes, () => excluirUsuarioAdmin({ uid: u.uid })),
        }),
      );
    }

    const situacao = situacaoDe(u);
    const chips = Object.values(RECURSOS).map((chave) =>
      h('span', { class: `chip-recurso${u.recursos[chave] ? ' ligado' : ''}`, title: `${ROTULOS_RECURSOS[chave]}: ${u.recursos[chave] ? 'liberada' : 'desligada'}` }, ABREVIACAO_RECURSO[chave] ?? chave),
    );
    return h(
      'tr',
      null,
      h(
        'td',
        null,
        h(
          'div',
          { class: 'usr-pessoa' },
          h('span', { class: 'usr-avatar', 'aria-hidden': 'true' }, inicialDe(u)),
          h('div', null, h('strong', null, (u.nome || 'Sem nome') + (ehEu ? ' (você)' : '')), h('small', { class: 'texto-secundario' }, u.email)),
        ),
      ),
      h('td', null, h('span', { class: `selo ${ehAdmin ? 'selo-destaque' : 'selo-neutro'}` }, ROTULO_PAPEL[u.role] ?? u.role)),
      h('td', null, h('span', { class: `selo ${VARIANTE_SITUACAO[situacao]}` }, situacao)),
      h('td', null, h('div', { class: 'usr-chips' }, ...chips)),
      h('td', null, u.criadoEm ? dataCurta(u.criadoEm) : '—'),
      h('td', null, h('div', { class: 'acoes-icones' }, ...acoes)),
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
    const [colUsuario, colPapel, colSituacao, colCadastro] = cabecalho;
    corpoTabela.replaceChildren(
      h(
        'table',
        { class: 'tabela tabela-usuarios' },
        h('thead', null, h('tr', null, colUsuario, colPapel, colSituacao, h('th', { scope: 'col' }, 'Funcionalidades'), colCadastro, h('th', { scope: 'col', class: 'col-acoes' }, 'Ações'))),
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
        h('p', { class: 'texto-secundario' }, 'Crie, edite, bloqueie ou exclua contas. O ícone de controles abre as funcionalidades de cada pessoa. Novos usuários nascem com IA ligada e Garmin desligado.'),
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
