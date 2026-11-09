import { contextoDaPassagem, ROTULOS_DO_CONTEXTO, tendenciaLinear } from '@no-strova/domain';
import { h } from '../../../utils/dom.js';
import { formatarData, formatarDuracaoCurta, formatarNumero } from '../../../utils/formatters.js';
import { icone } from '../../../utils/icones.js';
import { abrirTreinoAdaptado } from './treinoAdaptado.js';
import { criarComparacao } from './comparacao.js';
import { graficoEvolucao } from './graficos.js';
import { abrirAjusteDeTrecho, criarCartaoRota } from './rota.js';
import { kmTexto, metricasDoEsporte, ROTULO_SENSACAO, textoDeDesempenho, textoDeVariacao, textoDoTrecho } from './textos.js';

const ROTULO_MEDALHA = Object.freeze({ ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze' });
const FATORES_DE_CLIMA = new Set(['calor', 'frio']);

const COLUNAS = [
  { campo: 'data', rotulo: 'Data', valor: (p) => p.data },
  { campo: 'tempo', rotulo: 'Tempo', valor: (p) => p.tempoS },
  { campo: 'distancia', rotulo: 'Distância', valor: (p) => p.distanciaM },
  { campo: 'desempenho', rotulo: null, valor: (p) => p.velocidadeKmh },
  { campo: 'fc', rotulo: 'FC média', valor: (p) => p.fcMedia },
  { campo: 'eficiencia', rotulo: 'Eficiência', valor: (p) => p.eficiencia },
  { campo: 'hrss', rotulo: 'HRSS', valor: (p) => p.hrss },
  { campo: 'sensacao', rotulo: 'Sensação', valor: (p) => p.sensacao },
];

function ordenar(passagens, { campo, direcao }) {
  const col = COLUNAS.find((c) => c.campo === campo) ?? COLUNAS[0];
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...passagens].sort((x, y) => {
    const a = col.valor(x);
    const b = col.valor(y);
    // sem valor vai sempre para o fim
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
    if (b === null || b === undefined) return -1;
    return (a < b ? -1 : a > b ? 1 : 0) * sinal;
  });
}

function bloco(rotulo, valor, detalhe, classe = '') {
  return h('div', { class: `traj-stat ${classe}`.trim() }, h('p', { class: 'cg-mini-rotulo' }, rotulo), h('p', { class: 'traj-stat-valor' }, valor), detalhe ? h('p', { class: 'texto-secundario traj-stat-detalhe' }, detalhe) : null);
}

/**
 * Painel de um trajeto: resumo, rota de referência, gráfico de evolução, tabela de passagens e comparação.
 * O estado (métrica, seleção, ordem, filtro) vem de `estado` e sobrevive aos redesenhos; `aoMudar` pede um redesenho.
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarPainel({ item, esporte, estado, aoMudar, uid, nivelInicial, aoCriarTreino }) {
  const { trajeto, passagens, resumo, podio, rota } = item;
  const destrutores = [];
  const metricas = metricasDoEsporte(esporte);
  const metrica = metricas.find((m) => m.id === estado.metrica) ?? metricas[0];
  const contexto = new Map(passagens.map((p) => [p.id, contextoDaPassagem(p).map((id) => ROTULOS_DO_CONTEXTO[id])]));
  const idsDoTrajeto = new Set(passagens.map((p) => p.id));
  estado.comparadas = estado.comparadas.filter((id) => idsDoTrajeto.has(id));

  const temRotaDeReferencia = Boolean(trajeto.rotaAtividadeId);
  const botaoTreino = h(
    'button',
    { class: 'btn traj-treino-acao', type: 'button', disabled: !temRotaDeReferencia, 'aria-describedby': temRotaDeReferencia ? null : 'traj-treino-dica' },
    icone('ia', 16),
    ' Criar treino adaptado ao trajeto',
  );
  botaoTreino.addEventListener('click', async () => {
    const r = await abrirTreinoAdaptado({ uid, trajeto: { id: trajeto.id, nome: trajeto.nome }, esporte, nivelInicial });
    if (r?.salvo) aoCriarTreino?.(r);
  });
  const cabecalho = h(
    'section',
    { class: 'card' },
    h('h2', null, trajeto.nome),
    h('p', { class: 'texto-secundario' }, passagens.length === 0 ? 'Nenhuma atividade neste trajeto ainda.' : `${passagens.length} ${passagens.length === 1 ? 'passagem' : 'passagens'}${rota ? ', medidas no trecho que acompanha a rota de referência' : ', medidas na atividade inteira (defina a rota de referência para medir só o trecho)'}.`),
    h('div', { class: 'traj-treino' }, botaoTreino, temRotaDeReferencia ? h('small', { class: 'dica' }, 'Monta um treino intervalado que acompanha as subidas e descidas deste trajeto.') : h('small', { class: 'dica', id: 'traj-treino-dica' }, 'Defina a rota de referência do trajeto (abaixo) para criar um treino adaptado ao terreno.')),
  );
  const cartaoRota = criarCartaoRota({ trajeto, passagens, rota });
  destrutores.push(cartaoRota.destruir);

  if (passagens.length === 0) {
    return {
      el: h('div', { class: 'pilha' }, cabecalho, h('p', { class: 'vazio-curto' }, 'Vincule atividades a este trajeto no “Como foi?” de cada uma. ', h('a', { href: '#/atividades' }, 'Ir para Atividades'))),
      destruir: () => destrutores.forEach((f) => f()),
    };
  }

  // resumo
  const ir = resumo.inicioRecente;
  const tendV = tendenciaLinear(passagens, (p) => p.velocidadeKmh);
  const tiles = [
    bloco('Passagens', String(resumo.total), `${formatarData(resumo.primeira)} a ${formatarData(resumo.ultima)}`),
    bloco('Melhor passagem', textoDeDesempenho(resumo.melhor, esporte), formatarData(resumo.melhor.data)),
    bloco(
      'Início × recente',
      ir ? textoDeVariacao(ir.velocidade) : '—',
      ir ? `de velocidade: média das ${ir.n} primeiras contra as ${ir.n} últimas` : 'Precisa de ao menos 2 passagens',
      ir && ir.velocidade > 0 ? 'traj-melhor' : ir && ir.velocidade < 0 ? 'traj-pior' : '',
    ),
    bloco(
      'Eficiência (início × recente)',
      ir && ir.eficiencia !== null ? textoDeVariacao(ir.eficiencia) : '—',
      ir && ir.eficiencia !== null ? 'mais metros por batimento é melhor condicionamento' : 'Precisa de FC em passagens do início e do fim',
      ir && ir.eficiencia > 0 ? 'traj-melhor' : ir && ir.eficiencia < 0 ? 'traj-pior' : '',
    ),
    bloco('Constância', resumo.consistencia === null ? '—' : `${formatarNumero(resumo.consistencia * 100, 1)}%`, 'variação da velocidade entre passagens (menor é mais constante)'),
    bloco('Tendência', tendV ? `${tendV.inclinacaoPorMes > 0 ? '+' : tendV.inclinacaoPorMes < 0 ? '−' : ''}${formatarNumero(Math.abs(tendV.inclinacaoPorMes), 2)} km/h` : '—', tendV ? 'de velocidade por mês, pela reta de todas as passagens' : 'Precisa de ao menos 3 passagens'),
    bloco('Distância usual', kmTexto(resumo.distanciaTipicaM), resumo.destoantes > 0 ? `${resumo.destoantes} ${resumo.destoantes === 1 ? 'passagem tem' : 'passagens têm'} distância bem diferente: confira o trecho` : resumo.semTrecho > 0 && rota ? `${resumo.semTrecho} ${resumo.semTrecho === 1 ? 'passagem mede' : 'passagens medem'} a atividade inteira` : null, resumo.destoantes > 0 ? 'traj-aviso' : ''),
  ];

  // gráfico
  const selecionadas = new Set(estado.comparadas);
  const visiveis = estado.ocultarClima ? passagens.filter((p) => !p.etiquetas.some((e) => FATORES_DE_CLIMA.has(e))) : passagens;
  const alternar = (id) => {
    const lista = estado.comparadas.includes(id) ? estado.comparadas.filter((x) => x !== id) : [...estado.comparadas, id].slice(-2);
    estado.comparadas = lista;
    aoMudar();
  };
  const segmentado = h(
    'div',
    { class: 'segmentado', role: 'group', 'aria-label': 'Métrica do gráfico' },
    ...metricas.map((m) => h('button', { class: 'cg-periodo', type: 'button', 'aria-pressed': String(m.id === metrica.id), onClick: () => { estado.metrica = m.id; aoMudar(); } }, m.rotulo)),
  );
  const filtroClima = h('label', { class: 'traj-opcao' }, h('input', { type: 'checkbox', checked: estado.ocultarClima, onChange: (e) => { estado.ocultarClima = e.target.checked; aoMudar(); } }), ' Ocultar passagens com calor ou frio');
  const grafico = h(
    'section',
    { class: 'card pilha' },
    h('div', { class: 'bloco-topo' }, h('h2', null, 'Evolução'), segmentado),
    h('p', { class: 'texto-secundario' }, metrica.id === 'eficiencia' ? 'Eficiência aeróbica: metros por minuto para cada batimento por minuto. Quanto mais alto, mais rápido você anda para a mesma FC.' : metrica.invertido ? 'O melhor fica em cima: ritmos menores sobem no gráfico.' : 'Clique em dois pontos para comparar as passagens.'),
    graficoEvolucao({ passagens: visiveis, metrica, selecionadas, podio, contexto, tendencia: tendenciaLinear(visiveis, metrica.campo), aoAlternar: alternar }),
    h(
      'p',
      { class: 'traj-legenda texto-secundario' },
      h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-ouro' }), 'pódio'),
      h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-contexto' }), 'calor, frio, dor ou sensação pesada'),
      h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-sel' }), 'selecionada'),
      h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra traj-amostra-tendencia' }), 'tendência'),
    ),
    filtroClima,
  );

  // tabela
  const colunaDesempenho = esporte === 'corrida' ? 'Ritmo' : 'Velocidade';
  const ordem = estado.ordem;
  const cabecalhoTabela = h(
    'tr',
    null,
    h('th', { scope: 'col', class: 'traj-col-sel' }, h('span', { class: 'sr-only' }, 'Comparar')),
    ...COLUNAS.map((c) => {
      const rotulo = c.rotulo ?? colunaDesempenho;
      return h(
        'th',
        { scope: 'col', 'aria-sort': c.campo === ordem.campo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', onClick: () => { estado.ordem = { campo: c.campo, direcao: c.campo === ordem.campo && ordem.direcao === 'desc' ? 'asc' : 'desc' }; aoMudar(); } }, rotulo + (c.campo === ordem.campo ? (ordem.direcao === 'asc' ? ' ▲' : ' ▼') : '')),
      );
    }),
    h('th', { scope: 'col' }, 'Contexto'),
    h('th', { scope: 'col' }, 'Medido em'),
    h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Ações')),
  );
  const linha = (p) => {
    const medalha = podio.get(p.id);
    const sel = selecionadas.has(p.id);
    const cheio = !sel && estado.comparadas.length >= 2;
    return h(
      'tr',
      { class: sel ? 'traj-linha-sel' : '' },
      h('td', { class: 'traj-col-sel' }, h('input', { type: 'checkbox', checked: sel, 'aria-label': `Comparar a passagem de ${formatarData(p.data)}`, title: cheio ? 'Já há duas passagens: marcar esta troca a mais antiga.' : null, onChange: () => alternar(p.id) })),
      h('td', null, h('a', { href: `#/atividades/${p.id}` }, formatarData(p.data)), medalha ? h('span', { class: `traj-medalha traj-medalha-${medalha}` }, ROTULO_MEDALHA[medalha]) : null),
      h('td', null, formatarDuracaoCurta(p.tempoS)),
      h('td', null, kmTexto(p.distanciaM)),
      h('td', null, textoDeDesempenho(p, esporte)),
      h('td', null, p.fcMedia === null ? '—' : `${p.fcMedia} bpm`),
      h('td', null, p.eficiencia === null ? '—' : formatarNumero(p.eficiencia, 2)),
      h('td', null, p.hrss === null ? '—' : formatarNumero(p.hrss, 0)),
      h('td', null, p.sensacao === null ? '—' : ROTULO_SENSACAO[p.sensacao] ?? p.sensacao),
      h('td', null, contexto.get(p.id).length ? h('span', { class: 'traj-contexto' }, ...contexto.get(p.id).map((f) => h('span', { class: 'traj-chip-contexto' }, f))) : '—'),
      h('td', null, textoDoTrecho(p, !!rota)),
      h('td', null, p.temArquivo ? h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', onClick: async () => { if (await abrirAjusteDeTrecho({ passagem: p, temRota: !!rota })) aoMudar(); } }, 'Ajustar trecho') : null),
    );
  };
  const tabela = h(
    'section',
    { class: 'card pilha' },
    h('h2', null, 'Passagens'),
    h('p', { class: 'texto-secundario' }, 'Marque duas passagens para ver a comparação lado a lado, com parciais por km, gráficos sobrepostos e mapa.'),
    h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela traj-tabela' }, h('thead', null, cabecalhoTabela), h('tbody', null, ...ordenar(passagens, ordem).map(linha)))),
  );

  // comparação
  let comparacao = null;
  if (estado.comparadas.length === 2) {
    const [a, b] = estado.comparadas.map((id) => passagens.find((p) => p.id === id)).sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
    comparacao = criarComparacao({ a, b, esporte, rota, aoLimpar: () => { estado.comparadas = []; aoMudar(); } });
    destrutores.push(comparacao.destruir);
  }

  const aviso = rota ? null : h('p', { class: 'mensagem mensagem-aviso', role: 'note' }, 'Sem rota de referência, cada passagem vale como a atividade inteira. Se você segue por outros caminhos antes ou depois do trajeto, defina a rota abaixo.');
  return {
    el: h('div', { class: 'pilha' }, cabecalho, aviso, h('section', { class: 'traj-resumo' }, ...tiles), rota ? null : cartaoRota.el, grafico, tabela, comparacao?.el ?? null, rota ? cartaoRota.el : null),
    destruir: () => destrutores.forEach((f) => f()),
  };
}
