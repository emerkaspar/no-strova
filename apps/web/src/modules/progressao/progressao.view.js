import {
  calcularSerieForma,
  compararProgressao,
  dataDoDiaDoPeriodo,
  ehRecorrente,
  instanciasDaMeta,
  metaVale,
  diaDoPeriodo,
  PERIODOS_DE_PROGRESSAO,
  periodoDe,
  periodosAnteriores,
  serieDoPeriodo,
  TIPOS_DE_PROGRESSAO,
  valorEsperadoDaMeta,
} from '@no-strova/domain';
import { editarMeta, encerrarMetaDeProgressao, salvarMetaDeProgressao } from '../../application/progressao.js';
import { marcarConquistasComoVistas } from '../../core/functions.js';
import { observarConquistas } from '../../infrastructure/conquistasRepo.js';
import { observarAtividadesParaProgressao } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { excluirMetaProgressao, observarMetasProgressao } from '../../infrastructure/metasProgressaoRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { graficoProgressao } from './graficoProgressao.js';
import { painelDeObjetivos, prateleiraDeConquistas } from './objetivos.js';
import { consumirMetaPedida } from './state.js';
import { abrirModal, confirmar } from '../../utils/modal.js';
import { criarCartaoZonas } from './zonas.js';

const ANOS_DE_HISTORICO = 5;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ESPORTES = [
  ['ciclismo', 'Ciclismo'],
  ['corrida', 'Corrida'],
  ['outro', 'Outros'],
];
const ROTULO_ESTADO = Object.freeze({ atingida: 'Meta atingida', adiantada: 'Adiantada', 'no-ritmo': 'No ritmo', atrasada: 'Atrasada', 'sem-dados': 'Sem dados' });
const GRAVIDADE_ESTADO = Object.freeze({ atingida: 'ok', adiantada: 'ok', 'no-ritmo': 'ok', atrasada: 'alerta' });
const dois = (n) => String(n).padStart(2, '0');

/** Número com a unidade da métrica ("1.234 km", "12,5 h", "86,3"). */
function formatarValor(tipo, v, { unidade = true } = {}) {
  const cfg = TIPOS_DE_PROGRESSAO[tipo];
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const texto = formatarNumero(v, cfg.casas);
  return unidade && cfg.unidade ? `${texto} ${cfg.unidade}` : texto;
}

const comSinal = (tipo, v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const cfg = TIPOS_DE_PROGRESSAO[tipo];
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), cfg.casas)}${cfg.unidade ? ` ${cfg.unidade}` : ''}`;
};

/** Cartão de indicador do sistema (mesmo estilo dos recordes). */
function cartao({ rotulo, nomeIcone, valor, nota = null, gravidade = '' }) {
  return h(
    'article',
    { class: `ativ-recorde${gravidade ? ` peso-${gravidade}-cartao` : ''}` },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: `ativ-recorde-valor${gravidade ? ` peso-${gravidade}` : ''}` }, valor),
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: 'ativ-recorde-quando' }, nota)) : null,
  );
}

/** Rótulo enxuto de um período para a tabela: "Semana de 02/11" vira "02/11". */
const rotuloCurto = (periodo) => periodo.rotulo.replace(/^Semana de /, '');

/** Marcas do eixo X conforme o tipo de período. */
function marcadoresDo(periodo) {
  if (periodo.tipo === 'ano') {
    const ano = periodo.inicio.slice(0, 4);
    return MESES.map((rotulo, i) => ({ n: diaDoPeriodo(periodo, `${ano}-${dois(i + 1)}-01`), rotulo }));
  }
  if (periodo.tipo === 'mes') return [1, 5, 10, 15, 20, 25, 30].filter((n) => n <= periodo.dias).map((n) => ({ n, rotulo: String(n) }));
  return DIAS_DA_SEMANA.map((rotulo, i) => ({ n: i + 1, rotulo }));
}

function rotuloDoPonto(periodo, n) {
  const data = dataDoDiaDoPeriodo(periodo, n);
  return periodo.tipo === 'semana' ? `${DIAS_DA_SEMANA[n - 1]}, ${formatarData(data)}` : formatarData(data);
}

export function render(raiz, sessao) {
  const hoje = hojeIso();
  const anoHoje = Number(hoje.slice(0, 4));
  const dados = { atividades: [], dias: [], metas: [], conquistas: [] };
  const carregou = { atividades: false, dias: false, metas: false, conquistas: false };
  const avisadas = new Set(); // conquistas já marcadas como vistas nesta tela
  let temporizador = null;
  let metaPedida = consumirMetaPedida(); // objetivo clicado na Início: abre já selecionado
  let rolarAoDesenhar = false;
  const estado = {
    periodo: 'ano',
    tipo: 'distancia',
    esportes: new Set(),
    metaId: null,
    referenciaInicio: null, // início do período em foco quando vem de uma meta; null = o período atual
    escolhidos: null, // ids dos períodos anteriores marcados no gráfico; null = padrão
    formAberto: false,
    metaPendente: null, // id da meta recém-criada, selecionada quando o listener a trouxer
  };
  let grafico = null;
  const mensagem = areaMensagem();

  const metaSelecionada = () => dados.metas.find((m) => m.id === estado.metaId) ?? null;
  const referencia = () => periodoDe(estado.periodo, estado.referenciaInicio ?? hoje);
  const padraoDeAnteriores = () => (estado.periodo === 'ano' ? 2 : 3);

  function limparGrafico() {
    grafico?.destruir();
    grafico = null;
  }

  function aplicarMeta(meta) {
    estado.metaId = meta?.id ?? null;
    if (!meta) {
      estado.referenciaInicio = null;
      estado.escolhidos = null;
      return;
    }
    estado.periodo = meta.periodo;
    estado.tipo = meta.tipo;
    estado.esportes = new Set(meta.esportes ?? []);
    estado.referenciaInicio = ehRecorrente(meta) ? (instanciasDaMeta(meta, hoje).slice(-1)[0]?.inicio ?? null) : meta.inicio;
    estado.escolhidos = null;
  }

  function desenhar() {
    limparGrafico();
    if (!carregou.atividades || !carregou.dias || !carregou.metas || !carregou.conquistas) {
      raiz.replaceChildren(h('section', { class: 'card' }, h('h1', null, 'Progressão'), h('p', { class: 'vazio', role: 'status' }, 'Carregando…')));
      return;
    }
    const cfg = TIPOS_DE_PROGRESSAO[estado.tipo];
    const ref = referencia();
    const candidatos = [ref, ...periodosAnteriores(ref, 5)];
    const ids = estado.escolhidos ?? new Set(candidatos.slice(0, 1 + padraoDeAnteriores()).map((p) => p.id));
    const mostrados = candidatos.filter((p) => p.id === ref.id || ids.has(p.id));

    const condicionamentoPorData = new Map(calcularSerieForma(dados.dias, { ate: hoje }).map((d) => [d.data, d.fitness]));
    const esportes = [...estado.esportes];
    const series = mostrados.map((periodo) => serieDoPeriodo({ periodo, tipo: estado.tipo, atividades: dados.atividades, esportes, condicionamentoPorData, hoje }));
    const meta = metaSelecionada();
    const metaDoPeriodo = meta && metaVale(meta, ref) ? meta : null;
    const comp = compararProgressao({ series, referencia: ref, hoje, tipo: estado.tipo, meta: metaDoPeriodo });
    const serieRef = series.find((s) => s.periodo.id === ref.id);

    // ---- controles
    const segmentos = h(
      'div',
      { class: 'prog-segmentos', role: 'group', 'aria-label': 'Período' },
      Object.entries(PERIODOS_DE_PROGRESSAO).map(([id, p]) => {
        const botao = h('button', { class: 'prog-segmento', type: 'button', 'aria-pressed': String(estado.periodo === id) }, p.rotulo);
        botao.addEventListener('click', () => {
          if (estado.periodo === id) return;
          estado.periodo = id;
          estado.referenciaInicio = null;
          estado.escolhidos = null;
          estado.metaId = null;
          desenhar();
        });
        return botao;
      }),
    );

    const seletorTipo = seletor({ id: 'prog-tipo', rotulo: 'Tipo de progresso', opcoes: Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => ({ valor: id, rotulo: t.rotulo })), valor: estado.tipo });
    seletorTipo.addEventListener('change', () => {
      estado.tipo = seletorTipo.value;
      if (estado.tipo === 'condicionamento') estado.esportes = new Set();
      estado.metaId = null;
      desenhar();
    });

    const chipsEsporte = TIPOS_DE_PROGRESSAO[estado.tipo].acumulado
      ? h(
          'div',
          { class: 'prog-chips', role: 'group', 'aria-label': 'Esportes' },
          ESPORTES.map(([id, rotulo]) => {
            const botao = h('button', { class: 'prog-chip', type: 'button', 'aria-pressed': String(estado.esportes.has(id)) }, rotulo);
            botao.addEventListener('click', () => {
              if (estado.esportes.has(id)) estado.esportes.delete(id);
              else estado.esportes.add(id);
              estado.metaId = null;
              desenhar();
            });
            return botao;
          }),
        )
      : h('span', { class: 'texto-secundario' }, 'Considera todos os esportes');

    // "Nova meta" fica no cabeçalho de Objetivos; editar, encerrar e excluir ficam em cada cartão de objetivo.
    const botaoNova = h('button', { class: estado.formAberto ? 'btn btn-secundario' : 'btn', type: 'button', 'aria-expanded': String(estado.formAberto) }, estado.formAberto ? 'Fechar' : '+ Nova meta');
    botaoNova.addEventListener('click', () => {
      estado.formAberto = !estado.formAberto;
      desenhar();
    });
    const acoesDoObjetivo = {
      editar: (m) =>
        abrirModal({ classe: 'modal-meta', rotulo: 'Editar meta', conteudo: (fechar) => formularioDeMeta(m, fechar) }),
      encerrar: async (m) => {
        if (!(await confirmar({ titulo: 'Encerrar esta meta?', mensagem: `Ela deixa de valer ao fim d${m.periodo === 'mes' ? 'este mês' : 'esta semana'}. O histórico e as badges conquistadas continuam com você.`, confirmarTexto: 'Encerrar meta', tipo: 'aviso', icone: 'medalha' }))) return;
        mensagem.limpar();
        try {
          await encerrarMetaDeProgressao({ meta: m, hoje });
        } catch (err) {
          mensagem.mostrar(err.message || 'Não foi possível encerrar a meta.');
        }
      },
      excluir: async (m) => {
        if (!(await confirmar({ titulo: 'Excluir esta meta?', mensagem: 'Isso não pode ser desfeito.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
        mensagem.limpar();
        try {
          await excluirMetaProgressao(m.id);
          if (estado.metaId === m.id) estado.metaId = null;
        } catch (err) {
          mensagem.mostrar(err.message || 'Não foi possível excluir a meta.');
        }
      },
    };

    const controles = h(
      'div',
      { class: 'prog-controles' },
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Período'), segmentos),
      h('div', { class: 'prog-controle' }, h('label', { class: 'prog-rotulo', for: 'prog-tipo' }, 'Tipo de progresso'), seletorTipo),
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Esportes'), chipsEsporte),
    );

    // ---- cartões de resumo
    const valorRef = comp.linhas.find((l) => l.periodo.id === ref.id)?.valor ?? null;
    const porSemana = ref.tipo === 'ano';
    const cartoes = [
      cartao({ rotulo: cfg.acumulado ? `Acumulado · ${ref.rotulo}` : `Condicionamento · ${ref.rotulo}`, nomeIcone: 'atividades', valor: formatarValor(estado.tipo, valorRef), nota: `até ${formatarData(hoje <= ref.fim ? hoje : ref.fim)}` }),
    ];
    if (comp.meta) {
      const m = comp.meta;
      cartoes.push(
        cartao({ rotulo: 'Meta', nomeIcone: 'esporte', valor: formatarValor(estado.tipo, m.valorAlvo), nota: m.percentual === null ? null : `${formatarNumero(m.percentual, 0)}% concluída` }),
        cartao({ rotulo: 'Situação', nomeIcone: 'hrss', valor: ROTULO_ESTADO[m.estado], gravidade: GRAVIDADE_ESTADO[m.estado] ?? '', nota: `esperado até hoje: ${formatarValor(estado.tipo, m.esperadoHoje)}` }),
        cartao({ rotulo: 'Faltam', nomeIcone: 'distancia', valor: formatarValor(estado.tipo, m.faltam) }),
      );
      if (m.ritmoNecessarioPorDia !== null) {
        const ritmo = porSemana ? m.ritmoNecessarioPorDia * 7 : m.ritmoNecessarioPorDia;
        cartoes.push(cartao({ rotulo: `Ritmo necessário`, nomeIcone: 'duracao', valor: `${formatarValor(estado.tipo, ritmo)}`, nota: porSemana ? 'por semana, até o fim do ano' : `por dia, até o fim d${ref.tipo === 'mes' ? 'o mês' : 'a semana'}` }));
      }
    }
    if (comp.projecaoFim !== null) {
      cartoes.push(cartao({ rotulo: `Projeção do fim d${ref.tipo === 'ano' ? 'o ano' : ref.tipo === 'mes' ? 'o mês' : 'a semana'}`, nomeIcone: 'elevacao', valor: formatarValor(estado.tipo, comp.projecaoFim), nota: 'mantendo o ritmo médio até agora' }));
    }
    const anterior = comp.linhas.length > 1 ? comp.linhas.filter((l) => l.periodo.inicio < ref.inicio).slice(-1)[0] : null;
    if (anterior && !comp.meta) {
      cartoes.push(cartao({ rotulo: `No mesmo ponto em ${anterior.periodo.rotulo}`, nomeIcone: 'plano', valor: formatarValor(estado.tipo, anterior.valor), nota: valorRef === null || anterior.valor === null ? null : `${comSinal(estado.tipo, valorRef - anterior.valor)} em relação a ${anterior.periodo.rotulo}` }));
    }

    // ---- períodos comparados (chips) e gráfico
    const chipsPeriodos = h(
      'div',
      { class: 'prog-chips', role: 'group', 'aria-label': PERIODOS_DE_PROGRESSAO[ref.tipo].anteriores },
      candidatos.map((p) => {
        const i = mostrados.findIndex((x) => x.id === p.id);
        const marcado = p.id === ref.id || ids.has(p.id);
        const botao = h(
          'button',
          { class: `prog-chip${marcado ? ` gp-ano-${i % 5}` : ''}`, type: 'button', 'aria-pressed': String(marcado), disabled: p.id === ref.id, title: p.id === ref.id ? 'Período em foco' : 'Mostrar ou ocultar no gráfico' },
          marcado ? h('i', { class: 'prog-chip-ponto' }) : null,
          p.rotulo,
        );
        botao.addEventListener('click', () => {
          const novo = new Set(ids);
          if (novo.has(p.id)) novo.delete(p.id);
          else novo.add(p.id);
          estado.escolhidos = novo;
          desenhar();
        });
        return botao;
      }),
    );

    const projecao = comp.projecaoFim !== null && valorRef !== null ? { n0: comp.corte, v0: valorRef, n1: ref.dias, v1: comp.projecaoFim } : null;
    grafico = graficoProgressao({
      series: series.map((s) => ({ rotulo: s.periodo.rotulo, valores: s.valores, indice: mostrados.findIndex((p) => p.id === s.periodo.id) })),
      total: ref.dias,
      marcadores: marcadoresDo(ref),
      rotuloDoPonto: (n) => rotuloDoPonto(ref, n),
      acumulado: cfg.acumulado,
      meta: metaDoPeriodo ? { valorAlvo: metaDoPeriodo.valorAlvo, esperado: (n) => valorEsperadoDaMeta(metaDoPeriodo, ref, serieRef, n) } : null,
      projecao,
      corte: comp.corte,
      formatar: (v) => formatarValor(estado.tipo, v),
      formatarEixo: (v) => formatarValor(estado.tipo, v, { unidade: false }),
    });

    // ---- tabela de comparação
    const colunaRef = `Δ com ${rotuloCurto(ref)}`;
    const classeDelta = (v) => (v === null ? '' : v > 0 ? 'prog-delta-pos' : v < 0 ? 'prog-delta-neg' : '');
    const tabela = h(
      'div',
      { class: 'tabela-rolavel' },
      h(
        'table',
        { class: 'prog-tabela' },
        h('thead', null, h('tr', null, h('th', null, ref.tipo === 'semana' ? 'Semana de' : PERIODOS_DE_PROGRESSAO[ref.tipo].rotulo), h('th', null, 'Valor'), h('th', null, 'Δ anterior'), h('th', null, colunaRef), comp.meta ? h('th', null, 'Δ com a meta') : null)),
        h(
          'tbody',
          null,
          [...comp.linhas].reverse().map((l) => {
            const i = mostrados.findIndex((p) => p.id === l.periodo.id);
            return h(
              'tr',
              { class: l.periodo.id === ref.id ? 'prog-linha-ref' : '' },
              h('td', { class: `gp-ano-${i % 5} prog-periodo`, title: l.periodo.rotulo }, h('i', { class: 'prog-chip-ponto' }), rotuloCurto(l.periodo)),
              h('td', null, formatarValor(estado.tipo, l.valor)),
              h('td', { class: classeDelta(l.deltaAnterior) }, comSinal(estado.tipo, l.deltaAnterior)),
              h('td', { class: classeDelta(l.deltaReferencia) }, l.periodo.id === ref.id ? 'ø' : comSinal(estado.tipo, l.deltaReferencia)),
              comp.meta ? h('td', { class: classeDelta(l.deltaMeta) }, comSinal(estado.tipo, l.deltaMeta)) : null,
            );
          }),
        ),
      ),
    );

    const temDados = series.some((s) => s.valores.some((v) => Number.isFinite(v) && v > 0));
    const nomeDoPeriodo = ref.tipo === 'semana' ? ref.rotulo : `${PERIODOS_DE_PROGRESSAO[ref.tipo].rotulo.toLowerCase()} ${ref.rotulo}`;
    const tituloGrafico = `${cfg.rotulo}${cfg.acumulado ? ' acumulada' : ''} · ${nomeDoPeriodo}${comp.meta ? ` · meta ${formatarValor(estado.tipo, comp.meta.valorAlvo)}` : ''}`;

    raiz.replaceChildren(
      h(
        'div',
        { class: 'prog-pagina' },
      h(
        'header',
        { class: 'ativ-cabecalho' },
        h('div', null, h('h1', null, 'Progressão'), h('p', { class: 'texto-secundario' }, 'Acompanhe seus objetivos e compare o acumulado do ano, do mês ou da semana com os períodos anteriores.')),
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'prog-secao-topo' }, h('h2', null, 'Objetivos'), botaoNova),
        estado.formAberto ? formularioDeMeta() : null,
        painelDeObjetivos({
          metas: dados.metas,
          atividades: dados.atividades,
          condicionamentoPorData,
          hoje,
          selecionadaId: estado.metaId,
          acoes: acoesDoObjetivo,
          aoSelecionar: (m) => {
            aplicarMeta(m);
            desenhar();
            raiz.querySelector('.prog-analise')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }),
        mensagem.el,
      ),
      h('section', { class: 'card prog-analise' }, h('h2', null, 'Análise por período'), controles),
      h('div', { class: 'ativ-recordes-grade ativ-indicadores prog-cartoes' }, cartoes),
      temDados || !cfg.acumulado
        ? h(
            'section',
            { class: 'card prog-corpo' },
            h('div', { class: 'prog-grafico' }, h('h2', null, tituloGrafico), chipsPeriodos, grafico.el),
            h('div', { class: 'prog-lateral' }, h('h2', null, `${formatarData(ref.inicio).slice(0, 5)} → ${formatarData(hoje <= ref.fim ? hoje : ref.fim).slice(0, 5)}`), tabela),
          )
        : h('section', { class: 'card' }, estadoVazio('Nenhuma atividade encontrada neste período com os filtros escolhidos.')),
      h('section', { class: 'card' }, h('h2', null, 'Conquistas'), prateleiraDeConquistas(dados.conquistas)),
      criarCartaoZonas({ atividades: dados.atividades, hoje }),
      ),
    );
    if (rolarAoDesenhar && raiz.querySelector('.prog-corpo')) {
      rolarAoDesenhar = false;
      raiz.querySelector('.prog-corpo').scrollIntoView({ block: 'start' });
    }
  }

  /** Grupo de botões de escolha única (no lugar de um select). */
  function grupoDeBotoes({ rotulo, opcoes, valor, aoMudar, desativado = false, classe = '' }) {
    let atual = valor;
    const botoes = opcoes.map(([id, texto]) => {
      const b = h('button', { class: 'prog-segmento', type: 'button', 'aria-pressed': String(id === atual), disabled: desativado }, texto);
      b.addEventListener('click', () => {
        atual = id;
        botoes.forEach((x, i) => x.setAttribute('aria-pressed', String(opcoes[i][0] === atual)));
        aoMudar?.(atual);
      });
      return b;
    });
    return { el: h('div', { class: `campo ${classe}`.trim() }, h('span', { class: 'prog-rotulo' }, rotulo), h('div', { class: 'prog-segmentos', role: 'group', 'aria-label': rotulo }, botoes)), valor: () => atual };
  }

  /** Formulário de meta: "Nova meta" ou, com `metaEdicao`, a edição de uma existente (o período não muda). */
  function formularioDeMeta(metaEdicao = null, fecharModal = null) {
    const msg = areaMensagem();
    const editando = Boolean(metaEdicao);
    const periodoInicial = metaEdicao?.periodo ?? estado.periodo;
    const tipoInicial = metaEdicao?.tipo ?? estado.tipo;
    const periodo = grupoDeBotoes({ rotulo: 'Meta de', opcoes: Object.entries(PERIODOS_DE_PROGRESSAO).map(([id, p]) => [id, p.rotulo]), valor: periodoInicial, aoMudar: () => atualizar(), desativado: editando, classe: 'campo-periodo' });
    const ano = h('input', { id: 'nm-ano', type: 'number', min: '2000', max: '2100', value: String(anoHoje) });
    const tipo = grupoDeBotoes({ rotulo: 'Tipo', opcoes: Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => [id, t.rotulo]), valor: tipoInicial, aoMudar: () => atualizar(), classe: 'campo-largo' });
    const valor = h('input', { id: 'nm-valor', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 2000', autocomplete: 'off', value: editando ? formatarNumero(metaEdicao.valorAlvo, TIPOS_DE_PROGRESSAO[metaEdicao.tipo].casas) : '' });
    const escolhidos = new Set(metaEdicao ? (metaEdicao.esportes ?? []) : estado.esportes);
    const chips = h(
      'div',
      { class: 'prog-chips', role: 'group', 'aria-label': 'Esportes da meta' },
      ESPORTES.map(([id, rotulo]) => {
        const botao = h('button', { class: 'prog-chip', type: 'button', 'aria-pressed': String(escolhidos.has(id)) }, rotulo);
        botao.addEventListener('click', () => {
          if (escolhidos.has(id)) escolhidos.delete(id);
          else escolhidos.add(id);
          botao.setAttribute('aria-pressed', String(escolhidos.has(id)));
        });
        return botao;
      }),
    );
    const campoAno = h('div', { class: 'campo campo-ano' }, h('label', { for: 'nm-ano' }, 'Ano'), ano);
    const campoRecorrente = h('p', { class: 'texto-secundario prog-recorrente' }, '');
    const campoEsportes = h('div', { class: 'campo campo-largo' }, h('span', { class: 'prog-rotulo' }, 'Esportes (nenhum = todos)'), chips);
    const unidade = h('small', { class: 'dica' });
    const alteraDepois = editando && ehRecorrente(metaEdicao) && metaEdicao.inicio < periodoDe(metaEdicao.periodo, hoje).inicio;
    const atualizar = () => {
      campoAno.hidden = editando || periodo.valor() !== 'ano';
      campoRecorrente.hidden = periodo.valor() === 'ano';
      const sem = periodo.valor() === 'semana';
      campoRecorrente.textContent = alteraDepois
        ? `A alteração vale a partir d${sem ? 'esta semana' : 'este mês'}; os períodos anteriores e as badges já conquistadas continuam como estavam.`
        : sem ? 'Vale para todas as semanas, a partir desta, até você alterar ou encerrar a meta. Cada semana atingida rende uma badge.' : 'Vale para todos os meses, a partir deste, até você alterar ou encerrar a meta. Cada mês atingido rende uma badge.';
      campoEsportes.hidden = !TIPOS_DE_PROGRESSAO[tipo.valor()].acumulado;
      const u = TIPOS_DE_PROGRESSAO[tipo.valor()].unidade;
      unidade.textContent = u ? `Em ${u === 'h' ? 'horas' : u === 'km' ? 'quilômetros' : 'metros'}.` : 'Valor do Condicionamento que você quer ter no fim do período.';
    };
    atualizar();

    const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar meta');
    const cancelar = editando ? h('button', { class: 'btn btn-secundario', type: 'button' }, 'Cancelar') : null;
    cancelar?.addEventListener('click', () => fecharModal?.());
    const form = h(
      'form',
      { class: 'prog-form', novalidate: true },
      h('h2', null, editando ? 'Editar meta' : 'Nova meta'),
      h(
        'div',
        { class: 'prog-form-grade' },
        periodo.el,
        campoAno,
        h('div', { class: 'campo' }, h('label', { for: 'nm-valor' }, 'Valor da meta'), valor, unidade),
        tipo.el,
        campoEsportes,
      ),
      msg.el,
      h('div', { class: 'prog-rodape' }, campoRecorrente, h('div', { class: 'linha-botoes' }, salvar, cancelar)),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await executarComBotao(salvar, msg, async () => {
        if (editando) {
          const tipoNovo = tipo.valor();
          const esportesNovos = TIPOS_DE_PROGRESSAO[tipoNovo].acumulado ? [...escolhidos] : [];
          const id = await editarMeta({ uid: sessao.uid, meta: metaEdicao, metas: dados.metas, valorAlvo: valor.value, tipo: tipoNovo, esportes: esportesNovos, hoje });
          // se o objetivo editado era o que está no gráfico, o gráfico acompanha a mudança
          if (estado.metaId === metaEdicao.id) {
            if (id !== metaEdicao.id) estado.metaPendente = id; // nova vigência: seleciona quando o listener a trouxer
            else {
              estado.tipo = tipoNovo;
              estado.esportes = new Set(esportesNovos);
            }
          }
          fecharModal?.(true);
          desenhar();
          return;
        }
        // ano: o ano escolhido; semana e mês: a vigência começa no período atual
        const inicio = periodo.valor() === 'ano' ? `${ano.value}-01-01` : hoje;
        const id = await salvarMetaDeProgressao({ uid: sessao.uid, metas: dados.metas, hoje, entrada: { periodo: periodo.valor(), inicio, tipo: tipo.valor(), valorAlvo: valor.value, esportes: [...escolhidos] } });
        estado.formAberto = false;
        // a meta nova chega pelo listener; guarda o id para selecioná-la assim que aparecer
        estado.metaPendente = id;
        const naLista = dados.metas.find((m) => m.id === id);
        if (naLista) aplicarMeta(naLista);
        desenhar();
      });
    });
    return form;
  }

  const aoErro = () => {
    raiz.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar a progressão.')));
  };
  const desde = `${anoHoje - ANOS_DE_HISTORICO}-01-01`;
  const cancelar = [
    observarAtividadesParaProgressao(
      sessao.uid,
      desde,
      (lista) => {
        dados.atividades = lista;
        carregou.atividades = true;
        desenhar();
      },
      aoErro,
    ),
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        dados.dias = lista;
        carregou.dias = true;
        desenhar();
      },
      aoErro,
    ),
    observarMetasProgressao(
      sessao.uid,
      (lista) => {
        dados.metas = lista;
        carregou.metas = true;
        if (metaPedida) {
          const pedida = lista.find((m) => m.id === metaPedida);
          metaPedida = null;
          if (pedida) {
            aplicarMeta(pedida);
            rolarAoDesenhar = true;
          }
        }
        if (estado.metaPendente) {
          const nova = lista.find((m) => m.id === estado.metaPendente);
          if (nova) {
            aplicarMeta(nova);
            estado.metaPendente = null;
          }
        }
        if (estado.metaId && !lista.some((m) => m.id === estado.metaId)) aplicarMeta(null);
        desenhar();
      },
      aoErro,
    ),
    observarConquistas(
      sessao.uid,
      (lista) => {
        dados.conquistas = lista;
        carregou.conquistas = true;
        desenhar();
        // quem está vendo a tela já viu as badges novas: o selo "Nova" some depois de alguns segundos
        const novas = lista.filter((c) => c.vista === false && !avisadas.has(c.id)).map((c) => c.id);
        if (novas.length > 0) {
          novas.forEach((id) => avisadas.add(id));
          clearTimeout(temporizador);
          temporizador = setTimeout(() => marcarConquistasComoVistas({ ids: novas }).catch(() => {}), 4000);
        }
      },
      aoErro,
    ),
  ];
  desenhar();

  return () => {
    clearTimeout(temporizador);
    cancelar.forEach((fn) => fn());
    limparGrafico();
  };
}
