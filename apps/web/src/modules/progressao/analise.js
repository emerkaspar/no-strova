import {
  avaliarObjetivo,
  calcularSerieForma,
  compararProgressao,
  dataDoDiaDoPeriodo,
  diaDoPeriodo,
  ehRecorrente,
  instanciasDaMeta,
  metaVale,
  PERIODOS_DE_PROGRESSAO,
  periodoDe,
  periodosAnteriores,
  serieDoPeriodo,
  TIPOS_DE_PROGRESSAO,
  UNIDADE_DO_RITMO,
  valorEsperadoDaMeta,
} from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { cartaoIndicador } from './cartaoIndicador.js';
import { graficoProgressao } from './graficoProgressao.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const ESPORTES = [
  ['ciclismo', 'Ciclismo'],
  ['corrida', 'Corrida'],
  ['outro', 'Outros'],
];
const ROTULO_ESTADO = Object.freeze({ atingida: 'Meta atingida', adiantada: 'Adiantada', 'no-ritmo': 'No ritmo', atrasada: 'Atrasada', 'sem-dados': 'Sem dados' });
const GRAVIDADE_ESTADO = Object.freeze({ atingida: 'ok', adiantada: 'ok', 'no-ritmo': 'ok', atrasada: 'alerta' });
const ROTULO_INSTANCIA = Object.freeze({ atingido: 'atingido', 'nao-atingido': 'não atingido', futuro: 'ainda não começou' });
const MAXIMO_DE_INSTANCIAS = 24;
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

/** Estado de uma análise sem objetivo: o ano atual, distância, todos os esportes. */
export const estadoInicialDaAnalise = () => ({ periodo: 'ano', tipo: 'distancia', esportes: new Set(), metaId: null, referenciaInicio: null, escolhidos: null });

/** Aplica o escopo de um objetivo ao estado: o período, a métrica, os esportes e a instância em foco (a última, ou `inicioDaInstancia`). */
export function aplicarMetaAoEstado(estado, meta, hoje, inicioDaInstancia = null) {
  estado.metaId = meta?.id ?? null;
  estado.escolhidos = null;
  if (!meta) {
    estado.referenciaInicio = null;
    return;
  }
  estado.periodo = meta.periodo;
  estado.tipo = meta.tipo;
  estado.esportes = new Set(meta.esportes ?? []);
  estado.referenciaInicio = inicioDaInstancia ?? (ehRecorrente(meta) ? (instanciasDaMeta(meta, hoje).slice(-1)[0]?.inicio ?? null) : meta.inicio);
}

/**
 * Análise por período, para os modais da Progressão: controles (período, métrica, esportes), cartões, gráfico comparando
 * períodos e tabela, em uma coluna. Tem estado e redesenho próprios (só mexe no que é dela).
 *
 * Com `estado.metaId` (modal de um objetivo), o objetivo entra no gráfico (linha da meta, projeção) e nos cartões (faltam,
 * ritmo necessário), e a faixa de períodos da meta aparece no topo. Mudar período, métrica ou esportes solta o objetivo; o
 * botão "Voltar ao objetivo" o reaplica. Sem `estado.metaId` (modal "Comparar períodos"), é só a comparação livre.
 *
 * @param {object} p
 * @param {{ atividades: any[], dias: any[], metas: any[] }} p.dados
 * @param {string} p.hoje
 * @param {ReturnType<typeof estadoInicialDaAnalise>} p.estado estado mutável do modal
 * @param {string} [p.prefixo] evita ids repetidos entre modais
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarAnalise({ dados, hoje, estado, prefixo = 'md' }) {
  const raiz = h('div', { class: 'prog-analise-modal' });
  let grafico = null;
  const condicionamentoPorData = new Map(calcularSerieForma(dados.dias, { ate: hoje }).map((d) => [d.data, d.fitness]));
  const metaDoModal = dados.metas.find((m) => m.id === estado.metaId) ?? null;

  const metaSelecionada = () => dados.metas.find((m) => m.id === estado.metaId) ?? null;
  const referencia = () => periodoDe(estado.periodo, estado.referenciaInicio ?? hoje);
  const padraoDeAnteriores = () => (estado.periodo === 'ano' ? 2 : 3);

  function limpar() {
    grafico?.destruir();
    grafico = null;
  }

  /** Faixa com cada período do objetivo (semana ou mês) e se foi atingido; tocar num período o coloca em foco. */
  function faixaDeInstancias(meta, ref) {
    const lista = instanciasDaMeta(meta, hoje).slice(-MAXIMO_DE_INSTANCIAS);
    if (lista.length < 2) return null;
    const botoes = lista.map((periodo) => {
      const av = avaliarObjetivo({ meta, periodo, atividades: dados.atividades, condicionamentoPorData, hoje });
      const emFoco = estado.metaId === meta.id && periodo.inicio === ref.inicio;
      const pct = av.percentual === null ? '—' : `${Math.round(av.percentual)}%`;
      const botao = h(
        'button',
        { class: `an-instancia an-instancia-${av.estado}${emFoco ? ' an-instancia-foco' : ''}`, type: 'button', 'aria-pressed': String(emFoco), title: `${periodo.rotulo}: ${ROTULO_INSTANCIA[av.estado] ?? 'em andamento'}${av.percentual === null ? '' : ` (${pct})`}` },
        h('span', { class: 'an-instancia-rotulo' }, rotuloCurto(periodo)),
        h('strong', null, pct),
      );
      botao.addEventListener('click', () => {
        aplicarMetaAoEstado(estado, meta, hoje, periodo.inicio);
        desenhar();
      });
      return botao;
    });
    const atingidos = lista.filter((p) => avaliarObjetivo({ meta, periodo: p, atividades: dados.atividades, condicionamentoPorData, hoje }).estado === 'atingido').length;
    return h(
      'section',
      { class: 'an-instancias' },
      h('div', { class: 'an-instancias-topo' }, h('h3', null, `Histórico d${meta.periodo === 'mes' ? 'os meses' : 'as semanas'}`), h('span', { class: 'texto-secundario' }, `${atingidos} de ${lista.length} atingid${meta.periodo === 'mes' ? 'os' : 'as'} · toque para ver o período`)),
      h('div', { class: 'an-instancias-lista' }, botoes),
    );
  }

  function desenhar() {
    limpar();
    const cfg = TIPOS_DE_PROGRESSAO[estado.tipo];
    const ref = referencia();
    const candidatos = [ref, ...periodosAnteriores(ref, 5)];
    const ids = estado.escolhidos ?? new Set(candidatos.slice(0, 1 + padraoDeAnteriores()).map((p) => p.id));
    const mostrados = candidatos.filter((p) => p.id === ref.id || ids.has(p.id));

    const esportes = [...estado.esportes];
    const series = mostrados.map((periodo) => serieDoPeriodo({ periodo, tipo: estado.tipo, atividades: dados.atividades, esportes, condicionamentoPorData, hoje }));
    const meta = metaSelecionada();
    const metaDoPeriodo = meta && metaVale(meta, ref) ? meta : null;
    const comp = compararProgressao({ series, referencia: ref, hoje, tipo: estado.tipo, meta: metaDoPeriodo });
    const serieRef = series.find((s) => s.periodo.id === ref.id);

    const soltarMeta = () => {
      estado.metaId = null;
    };

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
          soltarMeta();
          desenhar();
        });
        return botao;
      }),
    );

    const idTipo = `${prefixo}-tipo`;
    const seletorTipo = seletor({ id: idTipo, rotulo: 'Tipo de progresso', opcoes: Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => ({ valor: id, rotulo: t.rotulo })), valor: estado.tipo });
    seletorTipo.addEventListener('change', () => {
      estado.tipo = seletorTipo.value;
      if (estado.tipo === 'condicionamento') estado.esportes = new Set();
      soltarMeta();
      desenhar();
    });

    const chipsEsporte = cfg.acumulado
      ? h(
          'div',
          { class: 'prog-chips', role: 'group', 'aria-label': 'Esportes' },
          ESPORTES.map(([id, rotulo]) => {
            const botao = h('button', { class: 'prog-chip', type: 'button', 'aria-pressed': String(estado.esportes.has(id)) }, rotulo);
            botao.addEventListener('click', () => {
              if (estado.esportes.has(id)) estado.esportes.delete(id);
              else estado.esportes.add(id);
              soltarMeta();
              desenhar();
            });
            return botao;
          }),
        )
      : h('span', { class: 'texto-secundario' }, 'Considera todos os esportes');

    const controles = h(
      'div',
      { class: 'prog-controles' },
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Período'), segmentos),
      h('div', { class: 'prog-controle' }, h('label', { class: 'prog-rotulo', for: idTipo }, 'Tipo de progresso'), seletorTipo),
      h('div', { class: 'prog-controle' }, h('span', { class: 'prog-rotulo' }, 'Esportes'), chipsEsporte),
    );

    // ---- cartões de resumo
    const valorRef = comp.linhas.find((l) => l.periodo.id === ref.id)?.valor ?? null;
    const cartoes = [
      cartaoIndicador({ rotulo: cfg.acumulado ? `Acumulado · ${ref.rotulo}` : `Condicionamento · ${ref.rotulo}`, nomeIcone: 'atividades', valor: formatarValor(estado.tipo, valorRef), nota: `até ${formatarData(hoje <= ref.fim ? hoje : ref.fim)}` }),
    ];
    if (comp.meta) {
      const m = comp.meta;
      cartoes.push(
        cartaoIndicador({ rotulo: 'Meta', nomeIcone: 'esporte', valor: formatarValor(estado.tipo, m.valorAlvo), nota: m.percentual === null ? null : `${formatarNumero(m.percentual, 0)}% concluída` }),
        cartaoIndicador({ rotulo: 'Situação', nomeIcone: 'hrss', valor: ROTULO_ESTADO[m.estado], gravidade: GRAVIDADE_ESTADO[m.estado] ?? '', nota: `esperado até hoje: ${formatarValor(estado.tipo, m.esperadoHoje)}` }),
        cartaoIndicador({ rotulo: 'Faltam', nomeIcone: 'distancia', valor: formatarValor(estado.tipo, m.faltam) }),
      );
      if (m.ritmoNecessarioPorDia !== null) {
        // a unidade acompanha o tamanho do período: ano em meses, mês em semanas, semana em dias
        const unidadeDoRitmo = UNIDADE_DO_RITMO[ref.tipo];
        const ritmo = m.ritmoNecessarioPorDia * unidadeDoRitmo.dias;
        cartoes.push(cartaoIndicador({ rotulo: 'Ritmo necessário', nomeIcone: 'duracao', valor: `${formatarValor(estado.tipo, ritmo)}`, nota: `por ${unidadeDoRitmo.nome}, até o fim ${unidadeDoRitmo.fim}` }));
      }
    }
    if (comp.projecaoFim !== null) {
      cartoes.push(cartaoIndicador({ rotulo: `Projeção do fim d${ref.tipo === 'ano' ? 'o ano' : ref.tipo === 'mes' ? 'o mês' : 'a semana'}`, nomeIcone: 'elevacao', valor: formatarValor(estado.tipo, comp.projecaoFim), nota: 'mantendo o ritmo médio até agora' }));
    }
    const anterior = comp.linhas.length > 1 ? comp.linhas.filter((l) => l.periodo.inicio < ref.inicio).slice(-1)[0] : null;
    if (anterior && !comp.meta) {
      cartoes.push(cartaoIndicador({ rotulo: `No mesmo ponto em ${anterior.periodo.rotulo}`, nomeIcone: 'plano', valor: formatarValor(estado.tipo, anterior.valor), nota: valorRef === null || anterior.valor === null ? null : `${comSinal(estado.tipo, valorRef - anterior.valor)} em relação a ${anterior.periodo.rotulo}` }));
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
    const tituloTabela = `${formatarData(ref.inicio).slice(0, 5)} → ${formatarData(hoje <= ref.fim ? hoje : ref.fim).slice(0, 5)}`;

    // ---- uma coluna: histórico do objetivo, filtros, cartões, gráfico e tabela
    const faixa = metaDoModal && ehRecorrente(metaDoModal) ? faixaDeInstancias(metaDoModal, ref) : null;
    let aviso = null;
    if (metaDoModal && estado.metaId !== metaDoModal.id) {
      const voltar = h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button' }, 'Voltar ao objetivo');
      voltar.addEventListener('click', () => {
        aplicarMetaAoEstado(estado, metaDoModal, hoje);
        desenhar();
      });
      aviso = h('div', { class: 'an-aviso', role: 'status' }, h('span', null, 'Você mudou os filtros: a meta saiu do gráfico.'), voltar);
    }
    raiz.replaceChildren(
      ...[
        faixa,
        aviso,
        h('section', { class: 'an-bloco' }, h('h3', null, 'Filtros'), controles),
        h('div', { class: 'ativ-recordes-grade ativ-indicadores prog-cartoes' }, cartoes),
        temDados || !cfg.acumulado
          ? h(
              'div',
              { class: 'an-grafico-modal' },
              h('section', { class: 'an-bloco' }, h('h3', null, tituloGrafico), chipsPeriodos, grafico.el),
              h('section', { class: 'an-bloco' }, h('h3', null, tituloTabela), tabela),
            )
          : estadoVazio('Nenhuma atividade encontrada neste período com os filtros escolhidos.'),
      ].filter(Boolean),
    );
  }

  desenhar();
  return { el: raiz, destruir: limpar };
}
