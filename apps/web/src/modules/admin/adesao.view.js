import { diasDesde, estaParado, faixaDeUso, situacaoGarmin, situacaoIntervals, ultimoUsoEm } from '@no-strova/domain';
import { painelAdesao } from '../../core/functions.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { alternarOrdemAdesao, estadoAdesao } from './state.js';

const COLUNAS = [
  { campo: 'nome', rotulo: 'Usuário' },
  { campo: 'ultimoUso', rotulo: 'Último uso' },
  { campo: 'intervals', rotulo: 'intervals.icu' },
  { campo: 'garmin', rotulo: 'Garmin' },
  { campo: 'atividades', rotulo: 'Atividades' },
  { campo: 'treinosIa', rotulo: 'Treinos da IA' },
  { campo: 'push', rotulo: 'Push' },
];

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'ativos', rotulo: 'Ativos (7 dias)' },
  { id: 'parados', rotulo: 'Parados' },
  { id: 'semConexao', rotulo: 'Sem conexão' },
  { id: 'comProblema', rotulo: 'Com problema' },
];

const ROTULO_INTERVALS = { ativa: ['selo-ok', 'Conectado'], chaveInvalida: ['selo-perigo', 'Chave inválida'], nao: ['selo-neutro', 'Não'] };
const ROTULO_GARMIN = { conectado: ['selo-ok', 'Conectado'], expirado: ['selo-aviso', 'Chave expirada'], nao: ['selo-neutro', 'Não'] };
const inicialDe = (u) => (u.nome || u.email || '?').trim().charAt(0).toUpperCase();
const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function textoDias(ms, agora) {
  const dias = diasDesde(ms, agora);
  if (dias === null) return 'Nunca';
  if (dias === 0) return 'Hoje';
  return dias === 1 ? 'Ontem' : `${dias} dias atrás`;
}

const valorDeOrdem = {
  nome: (u) => (u.nome || u.email).toLowerCase(),
  ultimoUso: (u) => ultimoUsoEm(u) ?? 0,
  intervals: (u) => ['nao', 'chaveInvalida', 'ativa'].indexOf(situacaoIntervals(u)),
  garmin: (u) => ['nao', 'expirado', 'conectado'].indexOf(situacaoGarmin(u)),
  atividades: (u) => u.atividades.total,
  treinosIa: (u) => u.treinosPlanejados.porIa,
  push: (u) => (u.push ? 1 : 0),
};

function passaNoFiltro(u, filtro, agora) {
  const semConexao = situacaoIntervals(u) === 'nao' && situacaoGarmin(u, agora) === 'nao';
  const problema = situacaoIntervals(u) === 'chaveInvalida' || situacaoGarmin(u, agora) === 'expirado';
  if (filtro === 'ativos') return u.aprovado && u.ativo && faixaDeUso(u, agora) === 'semana';
  if (filtro === 'parados') return estaParado(u, agora);
  if (filtro === 'semConexao') return u.aprovado && u.ativo && semConexao;
  if (filtro === 'comProblema') return problema;
  return true;
}

function filtrarEOrdenar(usuarios, agora) {
  const termo = estadoAdesao.busca.trim().toLowerCase();
  const { campo, direcao } = estadoAdesao.ordem;
  const fator = direcao === 'asc' ? 1 : -1;
  const valor = valorDeOrdem[campo] ?? valorDeOrdem.nome;
  return usuarios
    .filter((u) => passaNoFiltro(u, estadoAdesao.filtro, agora))
    .filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * fator;
    });
}

function cartaoResumo(rotulo, valor, detalhe) {
  return h('div', { class: 'adesao-kpi' }, h('span', { class: 'adesao-kpi-rotulo' }, rotulo), h('strong', { class: 'adesao-kpi-valor' }, String(valor)), h('small', { class: 'texto-secundario' }, detalhe));
}

function desenharResumo(r) {
  const de = (n) => `${n} de ${r.base} (${r.base === 0 ? 0 : Math.round((n / r.base) * 100)}%)`;
  return h(
    'div',
    { class: 'adesao-kpis' },
    cartaoResumo('Usuários liberados', r.base, `${r.cadastrados} cadastrados · ${r.pendentes} pendentes · ${r.bloqueados} bloqueados`),
    cartaoResumo('Ativos em 7 dias', r.ativos7, de(r.ativos7)),
    cartaoResumo('Ativos em 30 dias', r.ativos30, de(r.ativos30)),
    cartaoResumo('Parados há +14 dias', r.parados, 'Aprovados que não voltaram'),
    cartaoResumo('Com intervals.icu', r.comIntervals, `${de(r.comIntervals)}${r.intervalsComProblema ? ` · ${r.intervalsComProblema} com chave inválida` : ''}`),
    cartaoResumo('Com Garmin', r.comGarmin, de(r.comGarmin)),
    cartaoResumo('Com atividades', r.comAtividades, de(r.comAtividades)),
    cartaoResumo('Com notificações push', r.comPush, de(r.comPush)),
  );
}

function desenharFunil(funil) {
  return h(
    'ol',
    { class: 'adesao-funil' },
    ...funil.map((etapa) =>
      h(
        'li',
        null,
        h('div', { class: 'adesao-funil-topo' }, h('span', null, etapa.rotulo), h('strong', null, `${etapa.quantos} · ${etapa.percentual}%`)),
        h('div', { class: 'adesao-barra', role: 'img', 'aria-label': `${etapa.rotulo}: ${etapa.percentual}%` }, h('span', { style: `width:${etapa.percentual}%` })),
      ),
    ),
  );
}

function selo([classe, texto], titulo) {
  return h('span', { class: `selo ${classe}`, title: titulo ?? texto }, texto);
}

/**
 * Aba "Adesão" (só admin): resumo, funil e tabela de uso por usuário, com busca, filtros e ordenação. Os números vêm
 * da callable `painelAdesao`, que devolve só contagens e datas (nunca chaves nem dados de saúde).
 * @returns {() => void} limpa a aba ao sair
 */
export function render(raiz, { uid: meuUid }) {
  let painel = null;
  let ativa = true;
  const mensagem = areaMensagem();
  const areaResumo = h('div');
  const corpoTabela = h('div', { class: 'tabela-wrap' });
  const rodape = h('p', { class: 'texto-secundario' });
  const busca = h('input', {
    type: 'search',
    placeholder: 'Buscar por nome ou e-mail',
    'aria-label': 'Buscar por nome ou e-mail',
    value: estadoAdesao.busca,
    onInput: (e) => {
      estadoAdesao.busca = e.target.value;
      desenharTabela();
    },
  });
  const botaoAtualizar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => carregar() }, 'Atualizar');
  const chips = h('div', { class: 'ativ-grupo', role: 'group', 'aria-label': 'Filtro de usuários' });

  function desenharFiltros() {
    chips.replaceChildren(
      ...FILTROS.map((f) =>
        h(
          'button',
          {
            type: 'button',
            class: `ativ-chip${f.id === estadoAdesao.filtro ? ' ativo' : ''}`,
            'aria-pressed': String(f.id === estadoAdesao.filtro),
            onClick: () => {
              estadoAdesao.filtro = f.id;
              desenharFiltros();
              desenharTabela();
            },
          },
          f.rotulo,
        ),
      ),
    );
  }

  function linha(u, agora) {
    const intervals = situacaoIntervals(u);
    const garmin = situacaoGarmin(u, agora);
    const ultimo = ultimoUsoEm(u);
    const sync = (ms) => (ms ? `Última sincronização: ${dataCurta(ms)}` : 'Ainda não sincronizou');
    const fontes = u.atividades.porFonte;
    const situacao = !u.ativo ? ['selo-perigo', 'Bloqueado'] : !u.aprovado ? ['selo-aviso', 'Pendente'] : null;
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
          h(
            'div',
            null,
            h('strong', null, (u.nome || 'Sem nome') + (u.uid === meuUid ? ' (você)' : '')),
            h('small', { class: 'texto-secundario' }, u.email),
            situacao ? selo(situacao) : null,
          ),
        ),
      ),
      h('td', null, h('span', { class: estaParado(u, agora) ? 'adesao-parado' : '', title: ultimo ? dataCurta(ultimo) : 'Sem registro' }, textoDias(ultimo, agora))),
      h('td', null, selo(ROTULO_INTERVALS[intervals], u.intervals ? sync(u.intervals.ultimaSincronizacao) : 'Não conectado')),
      h('td', null, selo(ROTULO_GARMIN[garmin], u.garmin ? sync(u.garmin.ultimaSincronizacao) : 'Não conectado')),
      h('td', null, h('span', { title: `Garmin: ${fontes.garmin} · intervals.icu: ${fontes.intervals} · manuais: ${fontes.manual}` }, String(u.atividades.total))),
      h('td', null, String(u.treinosPlanejados.porIa)),
      h('td', null, u.push ? selo(['selo-ok', 'Ativo']) : selo(['selo-neutro', 'Não'])),
    );
  }

  function desenharTabela() {
    if (!painel) return;
    const agora = painel.geradoEm;
    const lista = filtrarEOrdenar([...painel.usuarios], agora);
    if (lista.length === 0) {
      corpoTabela.replaceChildren(h('p', { class: 'vazio' }, painel.usuarios.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum usuário para este filtro.'));
      return;
    }
    const { campo: ordenado, direcao } = estadoAdesao.ordem;
    const cabecalho = COLUNAS.map((c) =>
      h(
        'th',
        { scope: 'col', 'aria-sort': c.campo === ordenado ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              alternarOrdemAdesao(c.campo);
              desenharTabela();
            },
          },
          c.rotulo + (c.campo === ordenado ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''),
        ),
      ),
    );
    corpoTabela.replaceChildren(
      h('table', { class: 'tabela tabela-usuarios tabela-adesao' }, h('thead', null, h('tr', null, ...cabecalho)), h('tbody', null, ...lista.map((u) => linha(u, agora)))),
    );
  }

  async function carregar() {
    mensagem.limpar();
    botaoAtualizar.disabled = true;
    try {
      const dados = await painelAdesao();
      if (!ativa) return;
      painel = dados;
      areaResumo.replaceChildren(
        desenharResumo(dados.resumo),
        h('section', { class: 'card' }, h('h2', null, 'Funil de adesão'), h('p', { class: 'texto-secundario' }, 'Quantas pessoas chegaram a cada etapa, sobre todos os cadastrados.'), desenharFunil(dados.resumo.funil)),
      );
      rodape.textContent = `Atualizado em ${new Date(dados.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. O último uso considera o login mais recente e a última atividade registrada.`;
      desenharTabela();
    } catch (err) {
      if (!ativa) return;
      corpoTabela.replaceChildren();
      mensagem.mostrar(err.message);
    } finally {
      botaoAtualizar.disabled = false;
    }
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'pilha' },
      mensagem.el,
      areaResumo,
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Uso por usuário'),
        h('p', { class: 'texto-secundario' }, 'Só contagens e datas: chaves e dados de saúde não aparecem aqui.'),
        h('div', { class: 'barra-tabela' }, busca, botaoAtualizar),
        chips,
        corpoTabela,
        rodape,
      ),
    ),
  );
  desenharFiltros();
  corpoTabela.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
  carregar();

  return () => {
    ativa = false;
  };
}
