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
import { encerrarMetaDeProgressao, salvarMetaDeProgressao } from '../../application/progressao.js';
import { marcarConquistasComoVistas } from '../../core/functions.js';
import { observarConquistas } from '../../infrastructure/conquistasRepo.js';
import { observarAtividadesParaProgressao } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { excluirMetaProgressao, observarMetasProgressao } from '../../infrastructure/metasProgressaoRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { graficoProgressao } from './graficoProgressao.js';
import { painelDeObjetivos, prateleiraDeConquistas } from './objetivos.js';
import { consumirMetaPedida } from './state.js';
import { confirmar } from '../../utils/modal.js';
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

function rotuloDaMeta(m) {
  const esportes = m.esportes?.length ? ` · ${m.esportes.map((e) => ESPORTES.find(([id]) => id === e)?.[1] ?? e).join(', ')}` : '';
  const quando = ehRecorrente(m) ? `${m.periodo === 'mes' ? 'todos os meses' : 'todas as semanas'}${m.ate ? ' (encerrada)' : ''}` : periodoDe(m.periodo, m.inicio).rotulo;
  return `${PERIODOS_DE_PROGRESSAO[m.periodo].rotulo}: ${TIPOS_DE_PROGRESSAO[m.tipo].rotulo} ${formatarValor(m.tipo, m.valorAlvo)} · ${quando}${esportes}`;
}

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

    const seletorTipo = h('select', { id: 'prog-tipo', 'aria-label': 'Tipo de progresso' }, Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => h('option', { value: id, selected: id === estado.tipo }, t.rotulo)));
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

    const opcoesMeta = [...dados.metas].sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
    const seletorMeta = h(
      'select',
      { id: 'prog-meta', 'aria-label': 'Metas salvas' },
      h('option', { value: '' }, opcoesMeta.length ? 'Sem meta' : 'Nenhuma meta criada'),
      opcoesMeta.map((m) => h('option', { value: m.id, selected: m.id === estado.metaId }, rotuloDaMeta(m))),
    );
    seletorMeta.addEventListener('change', () => {
      aplicarMeta(dados.metas.find((m) => m.id === seletorMeta.value) ?? null);
      desenhar();
    });
    const botaoNova = h('button', { class: 'btn btn-secundario', type: 'button' }, estado.formAberto ? 'Fechar' : 'Nova meta');
    botaoNova.addEventListener('click', () => {
      estado.formAberto = !estado.formAberto;
      desenhar();
    });
    const botaoEncerrar = meta && ehRecorrente(meta) && !meta.ate ? h('button', { class: 'btn btn-secundario', type: 'button', title: 'Para de valer a partir do próximo período; o histórico e as badges ficam' }, 'Encerrar meta') : null;
    botaoEncerrar?.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Encerrar esta meta?', mensagem: `Ela deixa de valer ao fim d${meta.periodo === 'mes' ? 'este mês' : 'esta semana'}. As badges conquistadas continuam com você.`, confirmarTexto: 'Encerrar meta', tipo: 'aviso', icone: 'medalha' }))) return;
      mensagem.limpar();
      try {
        await encerrarMetaDeProgressao({ meta, hoje });
      } catch (err) {
        mensagem.mostrar(err.message || 'Não foi possível encerrar a meta.');
      }
    });
    const botaoExcluir = meta
      ? h('button', { class: 'btn btn-perigo', type: 'button' }, 'Excluir meta')
      : null;
    botaoExcluir?.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Excluir esta meta?', mensagem: 'Isso não pode ser desfeito.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
      mensagem.limpar();
      try {
        await excluirMetaProgressao(meta.id);
        estado.metaId = null;
      } catch (err) {
        mensagem.mostrar(err.message || 'Não foi possível excluir a meta.');
      }
    });

    const controles = h(
      'div',
      { class: 'prog-controles' },
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Período'), segmentos),
      h('div', { class: 'prog-controle' }, h('label', { class: 'prog-rotulo', for: 'prog-tipo' }, 'Tipo de progresso'), seletorTipo),
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Esportes'), chipsEsporte),
      h('div', { class: 'prog-controle prog-controle-meta' }, h('label', { class: 'prog-rotulo', for: 'prog-meta' }, 'Metas'), h('div', { class: 'linha-botoes' }, seletorMeta, botaoNova, botaoEncerrar, botaoExcluir)),
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
        'section',
        { class: 'card' },
        h('h1', null, 'Progressão'),
        h('p', { class: 'texto-secundario' }, 'Acompanhe o acumulado do ano, do mês ou da semana, compare com os períodos anteriores e crie metas de distância, tempo, elevação ou Condicionamento.'),
        controles,
        estado.formAberto ? formularioDeMeta() : null,
        mensagem.el,
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Objetivos'),
        painelDeObjetivos({
          metas: dados.metas,
          atividades: dados.atividades,
          condicionamentoPorData,
          hoje,
          selecionadaId: estado.metaId,
          aoSelecionar: (m) => {
            aplicarMeta(m);
            desenhar();
            raiz.querySelector('.prog-corpo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }),
      ),
      h('section', { class: 'card' }, h('h2', null, 'Conquistas'), prateleiraDeConquistas(dados.conquistas)),
      h('div', { class: 'ativ-recordes-grade ativ-indicadores prog-cartoes' }, cartoes),
      temDados || !cfg.acumulado
        ? h(
            'section',
            { class: 'card prog-corpo' },
            h('div', { class: 'prog-grafico' }, h('h2', null, tituloGrafico), chipsPeriodos, grafico.el),
            h('div', { class: 'prog-lateral' }, h('h2', null, `${formatarData(ref.inicio).slice(0, 5)} → ${formatarData(hoje <= ref.fim ? hoje : ref.fim).slice(0, 5)}`), tabela),
          )
        : h('section', { class: 'card' }, estadoVazio('Nenhuma atividade encontrada neste período com os filtros escolhidos.')),
      criarCartaoZonas({ atividades: dados.atividades, hoje }),
      ),
    );
    if (rolarAoDesenhar && raiz.querySelector('.prog-corpo')) {
      rolarAoDesenhar = false;
      raiz.querySelector('.prog-corpo').scrollIntoView({ block: 'start' });
    }
  }

  /** Formulário "Nova meta": período, qual período, tipo, valor e esportes. */
  function formularioDeMeta() {
    const msg = areaMensagem();
    const periodo = h('select', { id: 'nm-periodo' }, Object.entries(PERIODOS_DE_PROGRESSAO).map(([id, p]) => h('option', { value: id, selected: id === estado.periodo }, p.rotulo)));
    const ano = h('input', { id: 'nm-ano', type: 'number', min: '2000', max: '2100', value: String(anoHoje) });
    const tipo = h('select', { id: 'nm-tipo' }, Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => h('option', { value: id, selected: id === estado.tipo }, t.rotulo)));
    const valor = h('input', { id: 'nm-valor', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 2000', autocomplete: 'off' });
    const escolhidos = new Set(estado.esportes);
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
    const campoAno = h('div', { class: 'campo' }, h('label', { for: 'nm-ano' }, 'Ano'), ano);
    const campoRecorrente = h('p', { class: 'texto-secundario prog-recorrente' }, '');
    const campoEsportes = h('div', { class: 'campo' }, h('span', { class: 'prog-rotulo' }, 'Esportes (nenhum = todos)'), chips);
    const unidade = h('small', { class: 'dica' });
    const atualizar = () => {
      campoAno.hidden = periodo.value !== 'ano';
      campoRecorrente.hidden = periodo.value === 'ano';
      campoRecorrente.textContent = periodo.value === 'semana' ? 'Vale para todas as semanas, a partir desta, até você alterar ou encerrar a meta. Cada semana atingida rende uma badge.' : 'Vale para todos os meses, a partir deste, até você alterar ou encerrar a meta. Cada mês atingido rende uma badge.';
      campoEsportes.hidden = !TIPOS_DE_PROGRESSAO[tipo.value].acumulado;
      const u = TIPOS_DE_PROGRESSAO[tipo.value].unidade;
      unidade.textContent = u ? `Em ${u === 'h' ? 'horas' : u === 'km' ? 'quilômetros' : 'metros'}.` : 'Valor do Condicionamento que você quer ter no fim do período.';
    };
    periodo.addEventListener('change', atualizar);
    tipo.addEventListener('change', atualizar);
    atualizar();

    const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar meta');
    const form = h(
      'form',
      { class: 'prog-form', novalidate: true },
      h('h2', null, 'Nova meta'),
      h(
        'div',
        { class: 'prog-form-grade' },
        h('div', { class: 'campo' }, h('label', { for: 'nm-periodo' }, 'Meta de'), periodo),
        campoAno,
        h('div', { class: 'campo' }, h('label', { for: 'nm-tipo' }, 'Tipo'), tipo),
        h('div', { class: 'campo' }, h('label', { for: 'nm-valor' }, 'Valor da meta'), valor, unidade),
        campoEsportes,
      ),
      campoRecorrente,
      msg.el,
      h('div', { class: 'linha-botoes' }, salvar),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // ano: o ano escolhido; semana e mês: a vigência começa no período atual
      const inicio = periodo.value === 'ano' ? `${ano.value}-01-01` : hoje;
      await executarComBotao(salvar, msg, async () => {
        const id = await salvarMetaDeProgressao({ uid: sessao.uid, metas: dados.metas, hoje, entrada: { periodo: periodo.value, inicio, tipo: tipo.value, valorAlvo: valor.value, esportes: [...escolhidos] } });
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
