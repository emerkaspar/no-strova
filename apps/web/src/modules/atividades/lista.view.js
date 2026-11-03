import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { areaMensagem, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { painelImportar } from './importar.js';
import { painelManual } from './manual.js';
import { alternarOrdem, estadoAtividades } from './state.js';
import { OPCOES_ESPORTE, ROTULO_ESPORTE, ROTULO_ORIGEM_HRSS } from './textos.js';

const COLUNAS = [
  { campo: 'data', rotulo: 'Data' },
  { campo: 'esporte', rotulo: 'Esporte' },
  { campo: 'duracaoS', rotulo: 'Duração' },
  { campo: 'distanciaM', rotulo: 'Distância' },
  { campo: 'fcMedia', rotulo: 'FC média' },
  { campo: 'hrss', rotulo: 'HRSS' },
];

function textoBusca(a) {
  return [formatarData(a.data), a.data, ROTULO_ESPORTE[a.esporte], a.origem].join(' ').toLowerCase();
}

function filtrarEOrdenar(atividades) {
  const termo = estadoAtividades.busca.trim().toLowerCase();
  const { campo, direcao } = estadoAtividades.ordem;
  const fator = direcao === 'asc' ? 1 : -1;
  return atividades
    .filter((a) => !estadoAtividades.esporte || a.esporte === estadoAtividades.esporte)
    .filter((a) => !termo || textoBusca(a).includes(termo))
    .sort((a, b) => {
      const va = a[campo] ?? null;
      const vb = b[campo] ?? null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // vazios sempre no fim
      if (vb === null) return -1;
      const ordem = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem * fator;
    });
}

export function render(raiz, sessao) {
  let atividades = [];
  let semConfig = false;
  const cancelar = [];
  const mensagem = areaMensagem();
  const aviso = h('p', { class: 'mensagem', hidden: true });
  const corpo = h('div', { class: 'tabela-wrap' });
  const paineis = h('div');
  const contagem = h('span', { class: 'texto-secundario' });

  const busca = h('input', {
    type: 'search',
    placeholder: 'Buscar por data ou esporte',
    'aria-label': 'Buscar atividades',
    value: estadoAtividades.busca,
    onInput: (e) => {
      estadoAtividades.busca = e.target.value;
      desenharTabela();
    },
  });
  const filtroEsporte = selecao({
    id: 'filtro-esporte',
    rotulo: 'Esporte',
    opcoes: [{ valor: '', rotulo: 'Todos' }, ...OPCOES_ESPORTE],
    valor: estadoAtividades.esporte,
  });
  filtroEsporte.select.addEventListener('change', () => {
    estadoAtividades.esporte = filtroEsporte.select.value;
    desenharTabela();
  });

  function mostrarPainel(chave, construir) {
    if (paineis.dataset.aberto === chave) {
      paineis.replaceChildren();
      delete paineis.dataset.aberto;
      return;
    }
    paineis.replaceChildren(construir());
    paineis.dataset.aberto = chave;
  }
  const abrirImportar = () => painelImportar({ uid: sessao.uid });
  const abrirManual = () => painelManual();

  function linha(a) {
    const origem = ROTULO_ORIGEM_HRSS[a.hrssOrigem];
    return h(
      'tr',
      null,
      h('td', null, h('a', { href: `#/atividades/${a.id}` }, formatarData(a.data))),
      h('td', null, ROTULO_ESPORTE[a.esporte] ?? a.esporte),
      h('td', null, formatarDuracao(a.duracaoS)),
      h('td', null, formatarDistancia(a.distanciaM)),
      h('td', null, a.fcMedia ? `${a.fcMedia} bpm` : '—'),
      h(
        'td',
        null,
        a.hrss === null || a.hrss === undefined ? h('span', { class: 'badge badge-aviso', title: 'HRSS não calculado' }, 'sem HRSS') : formatarNumero(a.hrss, 1),
        origem && a.hrssOrigem !== 'fc' ? h('small', { class: 'dica', title: `HRSS ${origem}` }, ` (${a.hrssOrigem})`) : null,
        a.alertas?.length ? h('span', { class: 'badge badge-aviso', title: 'Há avisos nesta atividade' }, '!') : null,
      ),
    );
  }

  function desenharTabela() {
    const lista = filtrarEOrdenar([...atividades]);
    contagem.textContent = `${lista.length} de ${atividades.length} atividade${atividades.length === 1 ? '' : 's'}`;
    if (lista.length === 0) {
      corpo.replaceChildren(
        h('p', { class: 'vazio' }, atividades.length === 0 ? 'Nenhuma atividade ainda. Importe um arquivo ou registre uma manualmente.' : 'Nenhum resultado para o filtro.'),
      );
      return;
    }
    const { campo, direcao } = estadoAtividades.ordem;
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
    corpo.replaceChildren(
      h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ...cabecalho)), h('tbody', null, ...lista.map(linha))),
    );
  }

  function atualizarAviso() {
    aviso.hidden = !semConfig;
    if (semConfig) {
      aviso.className = 'mensagem';
      aviso.replaceChildren(
        'Cadastre a sua configuração de FC para calcular o HRSS. ',
        h('a', { href: '#/configuracao' }, 'Ir para Configuração'),
      );
    }
  }

  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, 'Atividades'),
      aviso,
      h(
        'div',
        { class: 'linha-botoes' },
        h('button', { class: 'btn', type: 'button', onClick: () => mostrarPainel('importar', abrirImportar) }, 'Importar arquivo'),
        h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => mostrarPainel('manual', abrirManual) }, 'Registrar manualmente'),
      ),
      paineis,
      h('div', { class: 'barra-tabela' }, busca, filtroEsporte.raiz, contagem),
      mensagem.el,
      corpo,
    ),
  );
  corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  cancelar.push(
    observarAtividades(
      sessao.uid,
      (lista) => {
        atividades = lista;
        desenharTabela();
      },
      () => mensagem.mostrar('Não foi possível carregar as atividades.'),
    ),
    observarConfigs(
      sessao.uid,
      (configs) => {
        semConfig = configs.length === 0;
        atualizarAviso();
      },
      () => {},
    ),
  );

  return () => cancelar.forEach((fn) => fn());
}
