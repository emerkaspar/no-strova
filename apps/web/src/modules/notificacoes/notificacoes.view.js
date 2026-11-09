import { GRUPOS_NOTIFICACAO } from '@no-strova/domain';
import { marcarNotificacoesComoLidas, marcarTodasNotificacoesComoLidas } from '../../core/functions.js';
import { observarNaoLidas, observarTodas } from '../../infrastructure/notificacoesRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarDataHora } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';

const ICONE_DO_GRUPO = {
  treino: 'treinos',
  corpo: 'peso',
  desempenho: 'hrss',
  metas: 'progressao',
  integracoes: 'garmin',
  conta: 'perfil',
};

const milissegundos = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

/**
 * Central de notificações: abas "Não lidas" e "Todas", filtro por grupo e "marcar todas como lidas".
 * A notificação só sai de "Não lidas" quando o usuário a marca como lida (mesmo que o motivo já tenha sido resolvido:
 * ela ganha o selo "Resolvido"). Quem grava é o servidor; aqui só se lê e se pede para marcar como lida.
 */
export function render(raiz, sessao) {
  const dados = { naoLidas: [], todas: [] };
  let aba = 'nao-lidas';
  let grupo = 'todos';
  const mensagem = areaMensagem();
  const cancelar = [];

  const lista = h('ul', { class: 'notif-lista' });
  const abas = h('div', { class: 'notif-abas', role: 'tablist', 'aria-label': 'Notificações' });
  const filtros = h('div', { class: 'notif-filtros', role: 'group', 'aria-label': 'Filtrar por grupo' });
  const botaoTodas = h('button', { class: 'btn btn-secundario', type: 'button', onClick: marcarTodas }, 'Marcar todas como lidas');

  async function pedir(acao) {
    mensagem.limpar();
    try {
      await acao();
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível atualizar as notificações.');
    }
  }

  const marcarUma = (id) => pedir(() => marcarNotificacoesComoLidas({ ids: [id] }));
  const marcarTodas = () => pedir(() => marcarTodasNotificacoesComoLidas({}));

  function itensVisiveis() {
    const base = aba === 'nao-lidas' ? dados.naoLidas : dados.todas;
    return grupo === 'todos' ? base : base.filter((n) => n.grupo === grupo);
  }

  function desenharItem(n) {
    const criado = milissegundos(n.criadoEm);
    return h(
      'li',
      { class: `notif-item${n.lida ? ' notif-lida' : ''}`, 'data-id': n.id },
      h('span', { class: 'notif-icone', 'aria-hidden': 'true' }, icone(ICONE_DO_GRUPO[n.grupo] ?? 'sino', 20)),
      h(
        'div',
        { class: 'notif-corpo' },
        h(
          'p',
          { class: 'notif-titulo' },
          n.titulo,
          n.resolvida ? h('span', { class: 'badge badge-ok' }, 'Resolvido') : null,
          n.lida ? null : h('span', { class: 'sr-only' }, ' (não lida)'),
        ),
        h('p', { class: 'notif-mensagem' }, n.mensagem),
        h('p', { class: 'notif-meta' }, `${GRUPOS_NOTIFICACAO[n.grupo] ?? 'Geral'} · ${criado ? formatarDataHora(criado) : '—'}`),
      ),
      h(
        'div',
        { class: 'notif-acoes' },
        n.rota ? h('a', { class: 'btn btn-secundario', href: n.rota }, 'Abrir') : null,
        n.lida ? null : h('button', { class: 'btn', type: 'button', onClick: () => marcarUma(n.id) }, 'Marcar como lida'),
      ),
    );
  }

  function desenhar() {
    const visiveis = itensVisiveis();
    const abrir = (id, rotulo, total) =>
      h(
        'button',
        { class: 'notif-aba', type: 'button', role: 'tab', 'aria-selected': String(aba === id), onClick: () => { aba = id; desenhar(); } },
        rotulo,
        total > 0 ? h('span', { class: 'badge' }, String(total)) : null,
      );
    abas.replaceChildren(abrir('nao-lidas', 'Não lidas', dados.naoLidas.length), abrir('todas', 'Todas', 0));

    const grupos = Object.entries({ todos: 'Todos', ...GRUPOS_NOTIFICACAO });
    filtros.replaceChildren(
      ...grupos.map(([id, rotulo]) =>
        h('button', { class: 'chip-filtro', type: 'button', 'aria-pressed': String(grupo === id), onClick: () => { grupo = id; desenhar(); } }, rotulo),
      ),
    );

    botaoTodas.disabled = dados.naoLidas.length === 0;
    lista.replaceChildren(
      ...(visiveis.length > 0
        ? visiveis.map(desenharItem)
        : [h('li', null, estadoVazio(aba === 'nao-lidas' ? 'Nenhuma notificação pendente. Tudo em dia.' : 'Nenhuma notificação por aqui ainda.'))]),
    );
  }

  const aoErro = () => mensagem.mostrar('Não foi possível carregar as notificações.');
  cancelar.push(
    observarNaoLidas(sessao.uid, (itens) => { dados.naoLidas = itens; desenhar(); }, aoErro),
    observarTodas(sessao.uid, (itens) => { dados.todas = itens; desenhar(); }, aoErro),
  );

  raiz.replaceChildren(
    h(
      'section',
      { class: 'card notif-cartao' },
      h('div', { class: 'notif-topo' }, h('h1', { class: 'notif-h1' }, 'Notificações'), botaoTodas),
      h('p', { class: 'dica' }, 'Cada aviso fica aqui até você marcá-lo como lido. Os lembretes e os horários podem ser ajustados em Configuração.'),
      abas,
      filtros,
      mensagem.el,
      lista,
    ),
  );
  desenhar();

  return () => cancelar.forEach((fn) => fn());
}
