import { iconeDoClima, condicaoDoClima, recordesDeClima, somarDias, anosComAtividades, atividadePrecisaCompletar, esforcosDoEsporte, medalhasDasAtividades, melhorMedalha, melhoresEsforcosDasAtividades, podioDaMetrica, VERSAO_DO_DETALHE, VERSAO_DOS_ESFORCOS, intervaloDoPeriodo, maiorCondicionamento, maiorSequenciaDeSemanas, RECURSOS, semanaMaisPesada, atividadesAntesDaPrimeiraVigencia, filtrarPorPeriodo, PERIODOS_RAPIDOS, primeiraVigencia, recordesDasAtividades, resumoDasAtividades, temRecurso, velocidadeMediaMs } from '@no-strova/domain';
import { montarSerie } from '../../application/forma.js';
import { obterSessao } from '../../application/sessao.js';
import { completarAtividades } from '../../application/completarAtividades.js';
import { guardarAtividadesParaMedalhas } from '../../application/medalhas.js';
import { garminSituacao } from '../../core/functions.js';
import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarTreinosVinculados } from '../../infrastructure/planoRepo.js';
import { observarTrajetos } from '../../infrastructure/trajetosRepo.js';
import { avisoDispensavel } from '../../utils/avisoDispensavel.js';
import { areaMensagem } from '../../utils/componentes.js';
import { resumoSincronizacao, semNovidades, sincronizarGarmin } from '../configuracao/garmin.js';
import { criarAbas, colunasDe } from '../../utils/abas.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { tempoDeEsforco, ritmoTexto } from './esforcos.js';
import { criarFaixaDeBadges, montarBadge } from './badges.js';
import { abrirFeedbackDaAtividade, abrirFeedbackPorId, dadosDaSensacao, dadosDoEsforco, textoDasEtiquetas } from './feedbackModal.js';
import { painelImportar } from './importar.js';
import { painelManual } from './manual.js';
import { criarCartaoDeMedalhas } from './medalhaCartao.js';
import { criarPopoversDosDados, guiaDoDado } from './popoverDosDados.js';
import { criarMiniaturas } from './previa.js';
import { estadoAtividades, EVENTO_IMPORTAR } from './state.js';
import { OPCOES_ESPORTE, ROTULO_ESPORTE, ROTULO_ORIGEM_HRSS } from './textos.js';

/** Campos pelos quais a lista pode ser ordenada (a linha não tem cabeçalho de colunas: o seletor fica na barra). */
const OPCOES_ORDEM = [
  { valor: 'data', rotulo: 'Data' },
  { valor: 'esporte', rotulo: 'Esporte' },
  { valor: 'distanciaM', rotulo: 'Distância' },
  { valor: 'duracaoS', rotulo: 'Duração' },
  { valor: 'velocidadeMs', rotulo: 'Vel. / Ritmo' },
  { valor: 'altimetriaM', rotulo: 'Elevação' },
  { valor: 'fcMedia', rotulo: 'FC média' },
  { valor: 'potenciaMediaW', rotulo: 'Potência' },
  { valor: 'temperaturaMediaC', rotulo: 'Temperatura' },
  { valor: 'hrss', rotulo: 'HRSS' },
  { valor: 'fonteOrdem', rotulo: 'Origem' },
];

/** Nome escrito sob o emblema de cada medalha. */
const ROTULO_DO_EMBLEMA = Object.freeze({ ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze', recente: 'Recente' });

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Qui, 05 nov 2026" a partir de `AAAA-MM-DD`. */
function dataCurtaDaAtividade(iso) {
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  if (!ano || !mes || !dia) return formatarData(iso);
  return `${DIAS_CURTOS[new Date(ano, mes - 1, dia).getDay()]}, ${String(dia).padStart(2, '0')} ${MESES_CURTOS[mes - 1]} ${ano}`;
}

const OPCOES_POR_PAGINA = [10, 25, 50, 100];

/** De onde veio a atividade: sincronizada do Garmin (`fonte`), arquivo enviado ou cadastro manual (`origem`). */
function origemDaAtividade(a) {
  if (a.fonte === 'garmin') return { id: 'garmin', rotulo: 'Garmin Connect', icone: 'garmin' };
  if (a.origem === 'manual') return { id: 'manual', rotulo: 'Cadastro manual', icone: 'lapis' };
  return { id: 'arquivo', rotulo: 'Arquivo importado', icone: 'arquivo' };
}

function textoBusca(a) {
  return [a.titulo, formatarData(a.data), a.data, ROTULO_ESPORTE[a.esporte], origemDaAtividade(a).rotulo].join(' ').toLowerCase();
}

/** Velocidade média: km/h no ciclismo (e em "outro"); ritmo em min/km na corrida. */
function textoVelocidade(a) {
  const v = a.velocidadeMs;
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (a.esporte === 'corrida') {
    const s = Math.round(1000 / v);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
  }
  return `${formatarNumero(v * 3.6, 1)} km/h`;
}

const metros = (m) => (Number.isFinite(m) && m > 0 ? `${formatarNumero(m, 0)} m` : '—');

/** Cards de recorde: rótulo, campo, ícone e como formatar o valor. */
/** Cartões de melhor 5 km e 10 km de um esporte (um par por esporte mostrado). */
const cartoesDeEsforco = (esporte) =>
  esforcosDoEsporte(esporte).map((e) => ({ id: `${e.id}-${esporte}`, grupo: 'esforcos', rotulo: e.rotulo, rotuloCompleto: `Melhor ${e.rotulo} · ${ROTULO_ESPORTE[esporte] ?? esporte}`, rotuloIcone: esporte, icone: 'duracao', formatar: tempoDeEsforco, esforcoM: e.metros, esporte }));

/** O cálculo do histórico roda sozinho uma vez por abertura do app (o botão continua para tentar de novo). */
let calculoAutomaticoIniciado = false;

/** Abas da seção de recordes, na ordem em que aparecem. Os melhores esforços (um por distância e esporte) entram na aba `esforcos`. */
const GRUPOS_DE_RECORDE = [
  { id: 'marcas', nome: 'Maiores marcas', titulo: 'Maiores marcas', icone: 'esporte' },
  { id: 'esforcos', nome: 'Esforços', titulo: 'Melhores esforços', icone: 'cronometro' },
  { id: 'potencia', nome: 'Potência', titulo: 'Potência (ciclismo)', icone: 'hrss' },
  { id: 'clima', nome: 'Clima', titulo: 'Clima', icone: 'nuvem' },
  { id: 'carga', nome: 'Carga', titulo: 'Carga e consistência', icone: 'atividades' },
];

const CHAVE_ABA_RECORDES = 'no-strova:recordes-aba';

const CARDS_DE_RECORDE = [
  { id: 'distancia', grupo: 'marcas', rotulo: 'Distância', rotuloCompleto: 'Maior distância', icone: 'distancia', formatar: (v) => formatarDistancia(v) },
  { id: 'duracao', grupo: 'marcas', rotulo: 'Tempo', rotuloCompleto: 'Maior tempo', icone: 'duracao', formatar: (v) => formatarDuracao(v) },
  { id: 'elevacao', grupo: 'marcas', rotulo: 'Elevação', rotuloCompleto: 'Maior elevação', icone: 'elevacao', formatar: metros },
  { id: 'hrss', grupo: 'marcas', rotulo: 'HRSS', rotuloCompleto: 'Maior HRSS', icone: 'hrss', formatar: (v) => formatarNumero(v, 1) },
  { id: 'fcMax', grupo: 'marcas', rotulo: 'FC máxima', rotuloCompleto: 'Maior FC máxima', icone: 'fc', formatar: (v) => `${formatarNumero(v, 0)} bpm` },
  { id: 'potencia', grupo: 'potencia', rotulo: 'Potência média', rotuloCompleto: 'Maior potência média · Ciclismo', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} W`, campo: 'potenciaMediaW' },
  { id: 'potencia20min', grupo: 'potencia', rotulo: 'Melhor 20 min', rotuloCompleto: 'Melhor 20 min de potência · Ciclismo', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} W`, campo: 'potenciaMax20minW' },
  { id: 'quente', grupo: 'clima', rotulo: 'Mais quente', rotuloCompleto: 'Atividade mais quente', icone: 'sol', formatar: (v) => `${formatarNumero(v, 1)} °C`, campo: 'temperaturaMediaC', aceitaZero: true },
  { id: 'fria', grupo: 'clima', rotulo: 'Mais fria', rotuloCompleto: 'Atividade mais fria', icone: 'floco', formatar: (v) => `${formatarNumero(v, 1)} °C`, campo: 'temperaturaMediaC', aceitaZero: true },
  { id: 'vento', grupo: 'clima', rotulo: 'Vento médio', rotuloCompleto: 'Maior vento médio', icone: 'vento', formatar: (v) => `${formatarNumero(v, 1)} km/h`, campo: 'ventoKmh' },
  { id: 'semanaPesada', grupo: 'carga', rotulo: 'Semana pesada', rotuloCompleto: 'Semana mais pesada', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} HRSS` },
  { id: 'sequencia', grupo: 'carga', rotulo: 'Sequência', rotuloCompleto: 'Maior sequência', icone: 'plano', formatar: (v) => `${v} semana${v === 1 ? '' : 's'}` },
  { id: 'condicionamento', grupo: 'carga', rotulo: 'Condicionamento', rotuloCompleto: 'Maior Condicionamento', icone: 'atividades', formatar: (v) => formatarNumero(v, 1), geral: true },
];


function iconeDoEsporte(esporte) {
  return icone(esporte === 'ciclismo' || esporte === 'corrida' ? esporte : 'outro', 16);
}

/** Atividades do esporte escolhido (todas, com "Todos"). */
const doEsporte = (atividades) => atividades.filter((a) => !estadoAtividades.esporte || a.esporte === estadoAtividades.esporte);

function filtrarEOrdenar(atividades) {
  const termo = estadoAtividades.busca.trim().toLowerCase();
  const { campo, direcao } = estadoAtividades.ordem;
  const fator = direcao === 'asc' ? 1 : -1;
  return atividades
    .filter((a) => !termo || textoBusca(a).includes(termo))
    .sort((a, b) => {
      const va = campo === 'fonteOrdem' ? origemDaAtividade(a).rotulo : (a[campo] ?? null);
      const vb = campo === 'fonteOrdem' ? origemDaAtividade(b).rotulo : (b[campo] ?? null);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // vazios sempre no fim
      if (vb === null) return -1;
      const ordem = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem * fator;
    });
}

export function render(raiz, sessao) {
  let atividades = [];
  let medalhas = new Map();
  let configs = null;
  let serieForma = [];
  let treinosVinculados = new Map(); // id da atividade -> treino planejado vinculado a ela
  let nomesDosTrajetos = new Map(); // id do trajeto de treino -> nome
  const cancelar = [];
  const mensagem = areaMensagem();
  const aviso = h('p', { class: 'mensagem', hidden: true });
  const mensagemGarmin = avisoDispensavel();
  const corpo = h('div', { class: 'ativ-lista-wrap' });
  const paineis = h('div');
  const contagem = h('span', { class: 'texto-secundario' });
  const paginacao = h('nav', { class: 'ativ-paginacao', 'aria-label': 'Paginação das atividades' });
  const popovers = criarPopoversDosDados();
  const miniaturas = criarMiniaturas({ iconeDoEsporte });
  const faixaDeBadges = criarFaixaDeBadges();
  // a medalha abre o cartão de recordes no lugar da prévia do mapa
  const medalhaCartao = criarCartaoDeMedalhas({ aoAbrir: () => popovers.fechar(), podioDe: (esporte, metrica) => podioDaMetrica(atividades, esporte, metrica) });

  const busca = h('input', {
    type: 'search',
    placeholder: 'Buscar por data ou esporte',
    'aria-label': 'Buscar atividades',
    value: estadoAtividades.busca,
    onInput: (e) => {
      estadoAtividades.busca = e.target.value;
      estadoAtividades.pagina = 1;
      desenharTabela();
    },
  });
  const seletorOrdem = seletor({ rotulo: 'Ordenar por', opcoes: OPCOES_ORDEM, valor: estadoAtividades.ordem.campo });
  const botaoDirecao = h('button', { type: 'button', class: 'ativ-ordenar-dir' });
  function desenharDirecao() {
    const crescente = estadoAtividades.ordem.direcao === 'asc';
    botaoDirecao.replaceChildren(icone(crescente ? 'setaCima' : 'setaBaixo', 16));
    botaoDirecao.title = botaoDirecao.ariaLabel = `Ordem ${crescente ? 'crescente' : 'decrescente'} (clique para inverter)`;
  }
  desenharDirecao();
  botaoDirecao.addEventListener('click', () => {
    estadoAtividades.ordem = { ...estadoAtividades.ordem, direcao: estadoAtividades.ordem.direcao === 'asc' ? 'desc' : 'asc' };
    estadoAtividades.pagina = 1;
    desenharDirecao();
    desenharTabela();
  });
  seletorOrdem.addEventListener('change', () => {
    estadoAtividades.ordem = { ...estadoAtividades.ordem, campo: seletorOrdem.value };
    estadoAtividades.pagina = 1;
    desenharTabela();
  });
  const ordenar = h('div', { class: 'ativ-ordenar' }, seletorOrdem, botaoDirecao);
  const chipsDaLista = h('div', { class: 'ativ-grupo ativ-chips-lista', role: 'group', 'aria-label': 'Filtrar a lista' });
  const hoje = hojeIso();
  const filtros = h('div', { class: 'ativ-filtros' });
  const resumo = h('div', { class: 'ativ-resumo' });
  const recordes = h('section', { class: 'ativ-recordes' });

  /** Atividades visíveis: esporte e período escolhidos. */
  const visiveis = () => filtrarPorPeriodo(doEsporte(atividades), estadoAtividades.periodo, hoje).map((a) => ({ ...a, velocidadeMs: velocidadeMediaMs(a) }));

  function chip(rotulo, ativo, aoClicar, conteudo = null) {
    return h('button', { type: 'button', class: `ativ-chip${ativo ? ' ativo' : ''}`, 'aria-pressed': String(ativo), onClick: aoClicar }, conteudo, rotulo);
  }

  /** Chips da barra da lista: esporte (o mesmo filtro do topo da página) e "Com recorde". */
  function desenharChipsDaLista() {
    const escolherEsporte = (valor) => () => {
      estadoAtividades.esporte = valor;
      estadoAtividades.soRecordes = false;
      estadoAtividades.pagina = 1;
      desenharTudo();
    };
    const { esporte, soRecordes } = estadoAtividades;
    chipsDaLista.replaceChildren(
      chip('Todos', !esporte && !soRecordes, escolherEsporte('')),
      chip('Ciclismo', esporte === 'ciclismo' && !soRecordes, escolherEsporte('ciclismo')),
      chip('Corrida', esporte === 'corrida' && !soRecordes, escolherEsporte('corrida')),
      chip('Com recorde', soRecordes, () => {
        estadoAtividades.soRecordes = !estadoAtividades.soRecordes;
        estadoAtividades.pagina = 1;
        desenharTudo();
      }),
    );
  }

  function desenharTudo() {
    desenharChipsDaLista();
    desenharFiltros();
    desenharResumo();
    desenharRecordes();
    desenharTabela();
  }

  function desenharFiltros() {
    const periodo = estadoAtividades.periodo;
    const anos = anosComAtividades(atividades);
    const escolher = (id) => () => {
      estadoAtividades.periodo = id;
      estadoAtividades.pagina = 1;
      desenharTudo();
    };
    const seletorAno = seletor({
      classe: `ativ-ano-ls${periodo.startsWith('ano:') ? ' ativo' : ''}`,
      rotulo: 'Escolher um ano',
      opcoes: [{ valor: '', rotulo: 'Ano…' }, ...anos.map((a) => ({ valor: `ano:${a}`, rotulo: String(a) }))],
      valor: periodo.startsWith('ano:') ? periodo : '',
    });
    seletorAno.addEventListener('change', () => {
      if (!seletorAno.value) return;
      estadoAtividades.periodo = seletorAno.value;
      estadoAtividades.pagina = 1;
      desenharTudo();
    });
    const esportes = [
      ['', 'Todos', null],
      ['ciclismo', 'Ciclismo', icone('ciclismo', 16)],
      ['corrida', 'Corrida', icone('corrida', 16)],
    ];
    filtros.replaceChildren(
      h('div', { class: 'ativ-grupo', role: 'group', 'aria-label': 'Período' }, ...PERIODOS_RAPIDOS.map((p) => chip(p.rotulo, periodo === p.id, escolher(p.id))), anos.length > 0 ? seletorAno : null),
      h(
        'div',
        { class: 'ativ-grupo', role: 'group', 'aria-label': 'Esporte' },
        ...esportes.map(([valor, rotulo, ic]) =>
          chip(
            rotulo,
            estadoAtividades.esporte === valor,
            () => {
              estadoAtividades.esporte = valor;
              estadoAtividades.pagina = 1;
              desenharTudo();
            },
            ic,
          ),
        ),
      ),
    );
  }

  function tile(rotuloDoTile, valor, nomeIcone, nota = null, dica = null) {
    return h(
      'div',
      { class: 'ativ-tile', title: dica },
      h('span', { class: 'ativ-tile-rotulo' }, icone(nomeIcone, 16), rotuloDoTile),
      h('strong', { class: 'ativ-tile-valor' }, valor),
      nota ? h('span', { class: 'ativ-tile-nota' }, nota) : null,
    );
  }

  function desenharResumo() {
    const r = resumoDasAtividades(visiveis());
    resumo.replaceChildren(
      tile('Atividades', String(r.atividades), 'atividades'),
      tile('Tempo', r.duracaoS > 0 ? formatarDuracao(r.duracaoS) : '—', 'duracao'),
      tile('Distância', r.distanciaM > 0 ? formatarDistancia(r.distanciaM) : '—', 'distancia'),
      tile('Elevação', metros(r.altimetriaM), 'elevacao'),
      tile('Carga (HRSS)', r.hrss > 0 ? formatarNumero(r.hrss, 0) : '—', 'hrss'),
    );
  }

  /**
   * Botão (só ícone) que calcula os melhores esforços e as zonas das atividades importadas antes desses recursos (o servidor
   * relê os arquivos). O texto completo e a contagem ficam no tooltip; o andamento aparece ao lado.
   */
  function botaoDeEsforcos(pendentes) {
    const textoCompleto = `Calcular melhores esforços e zonas do histórico (${pendentes} atividade${pendentes === 1 ? '' : 's'})`;
    const estado = h('span', { class: 'texto-secundario ativ-esforcos-estado', 'aria-live': 'polite' });
    const botao = h('button', { class: 'rec-atualizar', type: 'button', title: textoCompleto, 'aria-label': textoCompleto }, icone('atualizar', 16));
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.classList.add('rec-girando');
      let feitas = 0;
      try {
        estado.textContent = `Calculando… ${feitas} de ${pendentes}`;
        feitas = await completarAtividades((n) => {
          estado.textContent = `Calculando… ${n} de ${pendentes}`;
        });
        estado.textContent = 'Pronto.';
        botao.classList.remove('rec-girando');
      } catch (err) {
        estado.textContent = err.message || 'Não foi possível calcular agora.';
        botao.disabled = false;
        botao.classList.remove('rec-girando');
      }
    });
    return h('div', { class: 'rec-acoes' }, estado, botao);
  }

  function desenharRecordes() {
    if (atividades.length === 0) {
      recordes.replaceChildren();
      return;
    }
    const todos = estadoAtividades.periodo === 'tudo';
    // Melhor 5 km e 10 km: tempos só se comparam dentro de um esporte; "Todos" mostra um par por esporte.
    const esportesEsforco = estadoAtividades.esporte ? [estadoAtividades.esporte] : ['corrida', 'ciclismo'];
    const pendentes = atividades.filter((a) => atividadePrecisaCompletar(a, { versaoDosEsforcos: VERSAO_DOS_ESFORCOS, versaoDoDetalhe: VERSAO_DO_DETALHE })).length;
    // O Condicionamento não vem de uma atividade: é o pico da curva diária (vale para todos os esportes).
    // Recordes que não são de uma única atividade (semana, sequência e Condicionamento) entram sem link, com um texto de "quando".
    const calculados = (lista, intervalo) => {
      const pico = maiorCondicionamento(serieForma, intervalo);
      const semana = semanaMaisPesada(lista);
      const sequencia = maiorSequenciaDeSemanas(lista, hoje);
      const sem = (id, valor, quando) => ({ valor, atividade: { id, semLink: true, quando } });
      return {
        ...recordesDasAtividades(lista),
        ...recordesDeClima(lista),
        ...Object.fromEntries(
          esportesEsforco.flatMap((e) => {
            const m = melhoresEsforcosDasAtividades(lista.filter((a) => a.esporte === e));
            return esforcosDoEsporte(e).map((x) => [`${x.id}-${e}`, m[x.id]]);
          }),
        ),
        semanaPesada: semana ? sem(`sem:${semana.inicio}`, semana.valor, `Semana de ${formatarData(semana.inicio).slice(0, 5)}`) : null,
        sequencia: sequencia ? sem(`seq:${sequencia.valor}`, sequencia.valor, 'Semanas seguidas') : null,
        condicionamento: pico ? sem(`cond:${pico.data}`, pico.valor, formatarData(pico.data)) : null,
      };
    };
    const doPeriodo = calculados(visiveis(), intervaloDoPeriodo(estadoAtividades.periodo, hoje));
    const historicos = todos ? doPeriodo : calculados(doEsporte(atividades), null);
    const subtitulo = todos ? 'O maior valor em uma única atividade, de todos os tempos.' : 'O maior valor em uma única atividade no período, com o recorde histórico ao lado.';
    const comEsforcos = CARDS_DE_RECORDE.flatMap((c) => (c.id === 'duracao' ? [c, ...esportesEsforco.flatMap(cartoesDeEsforco)] : [c]));
    const cartoes = comEsforcos.filter((c) => {
      if (c.campo) return doEsporte(atividades).some((a) => Number.isFinite(a[c.campo]) && (c.aceitaZero || a[c.campo] > 0));
      return !c.esforcoM || atividades.some((a) => a.esporte === c.esporte && a.distanciaM >= c.esforcoM);
    });
    const botaoCalculo = pendentes > 0 ? botaoDeEsforcos(pendentes) : null;
    if (botaoCalculo && !calculoAutomaticoIniciado) {
      calculoAutomaticoIniciado = true;
      setTimeout(() => botaoCalculo.querySelector('button')?.click(), 0);
    }
    // recorde "novo": a atividade é dos últimos 7 dias (os recordes sem atividade, como a semana ou o Condicionamento, ficam de fora)
    const limiteNovo = somarDias(hoje, -6);
    const ehNovo = (c) => {
      const r = doPeriodo[c.id];
      return Boolean(r && !r.atividade.semLink && r.atividade.data >= limiteNovo);
    };
    const abas = GRUPOS_DE_RECORDE.map((g) => ({ ...g, cartoes: cartoes.filter((c) => c.grupo === g.id) })).filter((g) => g.cartoes.length > 0);

    function cartaoDeRecorde(c) {
      const r = doPeriodo[c.id];
      const hist = historicos[c.id];
      const ehHistorico = Boolean(r && hist && r.atividade.id === hist.atividade.id);
      const aux = r && !r.atividade.semLink && c.esforcoM ? ritmoTexto(r.atividade.esporte, r.valor, c.esforcoM) : null;
      return h(
        'article',
        { class: `rec-card${ehHistorico && !todos ? ' rec-card-historico' : ''}` },
        h(
          'div',
          { class: 'rec-card-topo' },
          h('span', { class: 'rec-card-icone' }, icone(c.icone, 16)),
          ehNovo(c) ? h('span', { class: 'rec-novo', title: 'Recorde batido nos últimos 7 dias' }, 'Novo') : null,
        ),
        h('span', { class: 'rec-card-rotulo', title: c.rotuloCompleto ?? c.rotulo }, c.rotuloIcone ? icone(c.rotuloIcone, 13) : null, c.rotulo),
        h('strong', { class: 'rec-card-valor' }, r ? c.formatar(r.valor) : '—'),
        h(
          'div',
          { class: 'rec-card-rodape' },
          r?.atividade.semLink
            ? h('span', { class: 'rec-card-quando' }, r.atividade.quando)
            : r
            ? h('a', { class: 'rec-card-quando', href: `#/atividades/${r.atividade.id}` }, iconeDoEsporte(r.atividade.esporte), formatarData(r.atividade.data))
            : h('span', { class: 'rec-card-quando texto-secundario' }, 'Sem registro'),
          aux ? h('span', { class: 'rec-card-aux' }, aux) : null,
          c.geral ? h('span', { class: 'rec-pill', title: 'Vale para todos os esportes: não segue o filtro de esporte' }, 'Geral') : null,
          ehHistorico && !todos ? h('span', { class: 'ativ-selo', title: 'É o recorde de todos os tempos' }, icone('esporte', 12), 'Histórico') : null,
        ),
        !todos && hist && !ehHistorico
          ? h(hist.atividade.semLink ? 'span' : 'a', { class: 'rec-card-hist', ...(hist.atividade.semLink ? {} : { href: `#/atividades/${hist.atividade.id}` }) }, `Histórico: ${c.formatar(hist.valor)} · ${hist.atividade.quando ?? formatarData(hist.atividade.data)}`)
          : null,
      );
    }

    const { lista: listaDeAbas, paineis } = criarAbas({
      chave: CHAVE_ABA_RECORDES,
      rotuloAria: 'Seções de recordes',
      abas: abas.map((g) => ({
        id: g.id,
        nome: g.nome,
        titulo: g.titulo,
        icone: g.icone,
        ponto: g.cartoes.some(ehNovo),
        painel: h('div', { class: 'rec-grade', style: `--cols:${colunasDe(g.cartoes.length)}` }, ...g.cartoes.map(cartaoDeRecorde)),
      })),
    });

    recordes.replaceChildren(h('div', { class: 'rec-topo' }, h('h2', { title: subtitulo }, 'Recordes'), listaDeAbas, botaoCalculo), ...paineis);
  }

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
  function abrirPainelDeImportacao() {
    paineis.replaceChildren(abrirImportar());
    paineis.dataset.aberto = 'importar';
  }
  window.addEventListener(EVENTO_IMPORTAR, abrirPainelDeImportacao);
  const abrirManual = () => painelManual();

  /** Sincroniza com o Garmin sem sair da tela. Só aparece para quem conectou o Garmin em Configuração. A lista se atualiza sozinha (onSnapshot). */
  const botaoGarmin = h('button', {
    class: 'btn-garmin',
    type: 'button',
    hidden: true,
    title: 'Sincronizar com o Garmin Connect',
    'aria-label': 'Sincronizar com o Garmin Connect',
  }, icone('garmin', 22));
  botaoGarmin.addEventListener('click', async () => {
    botaoGarmin.disabled = true;
    botaoGarmin.classList.add('carregando');
    mensagemGarmin.limpar();
    try {
      const situacao = await garminSituacao();
      if (!situacao.conectado) {
        botaoGarmin.hidden = true;
        mensagemGarmin.mostrar('O Garmin não está mais conectado. Conecte de novo em Configuração.');
        return;
      }
      mensagemGarmin.mostrar('Sincronizando com o Garmin…', 'carregando');
      const primeira = !situacao.ultimaSincronizacao;
      const { total, limitado } = await sincronizarGarmin({ dias: primeira ? 30 : undefined });
      const vazio = primeira ? 'Nos últimos 30 dias, nenhuma atividade foi encontrada.' : 'Desde a última sincronização, nenhuma atividade foi encontrada.';
      mensagemGarmin.mostrar(resumoSincronizacao(total, limitado, vazio), semNovidades(total) ? 'info' : 'ok');
      // uma única atividade nova: já pergunta como foi (com várias, ficam com o selo "Como foi?" na tabela)
      if (total.importadas === 1 && total.novasIds.length === 1) abrirFeedbackPorId(total.novasIds[0], { primeiraVez: true }).catch(() => {});
    } catch (err) {
      mensagemGarmin.mostrar(err.message || 'Não foi possível sincronizar com o Garmin.');
    } finally {
      botaoGarmin.disabled = false;
      botaoGarmin.classList.remove('carregando');
    }
  });

  // Sem o recurso liberado pelo administrador, nem consulta o Garmin: o botão fica escondido.
  if (temRecurso(obterSessao().perfil, RECURSOS.GARMIN)) {
    garminSituacao().then(
      (situacao) => {
        botaoGarmin.hidden = !situacao.conectado;
      },
      () => {}, // sem estado do Garmin, o botão fica escondido
    );
  }

  /**
   * Badges da atividade, na faixa abaixo do título. Para um badge novo: acrescente a entrada em `BADGES` (badges.js) e devolva-o aqui;
   * a ordem e o "+N" são da faixa.
   */
  function badgesDaAtividade(a) {
    // todos os badges ligados ao "Como foi?" (inclusive o vínculo com treino, o teste de LTHR e o trajeto, que se marcam ali) abrem o modal
    const abrirComoFoi = () => abrirFeedbackDaAtividade({ atividade: a });
    const lista = [];
    // o vínculo com um treino do Plano aparece sempre (vinculado ou não); os demais só quando preenchidos
    const treino = treinosVinculados.get(a.id);
    lista.push(treino ? montarBadge('vinculado', { rotulo: `Vinculada ao treino: ${treino.nomeTreino || 'do Plano'}`, aoClicar: abrirComoFoi }) : montarBadge('semVinculo', { aoClicar: abrirComoFoi }));
    const sensacao = dadosDaSensacao(a.feedback);
    lista.push(sensacao ? montarBadge('sensacao', { icone: sensacao.icone, rotulo: sensacao.rotulo, tom: sensacao.tom, aoClicar: abrirComoFoi }) : montarBadge('comoFoi', { aoClicar: abrirComoFoi }));
    const esforco = dadosDoEsforco(a.feedback);
    if (esforco) lista.push(montarBadge('esforco', { valor: esforco.valor, rotulo: esforco.rotulo, tom: esforco.tom, aoClicar: abrirComoFoi }));
    const etiquetas = textoDasEtiquetas(a.feedback);
    if (etiquetas) lista.push(montarBadge('etiquetas', { rotulo: `Marcou o treino: ${etiquetas}`, aoClicar: abrirComoFoi }));
    if (a.testeLthr === true) lista.push(montarBadge('testeLthr', { aoClicar: abrirComoFoi }));
    if (a.trajetoId) lista.push(montarBadge('trajeto', { rotulo: `Trajeto de treino: ${nomesDosTrajetos.get(a.trajetoId) ?? 'sem nome'}`, aoClicar: abrirComoFoi }));
    return lista;
  }

  /**
   * Coluna da medalha (60px, reservada mesmo sem medalha, para alinhar as linhas): o emblema do melhor recorde da atividade. Ao passar o mouse
   * abre o cartão de recordes (que diz o tipo de cada um); clicar em um recorde do cartão abre o ranking.
   */
  function emblemaDaMedalha(a, medalhasDaAtividade, escopo) {
    const coluna = h('div', { class: 'ativ-medalha-col' });
    if (!escopo) return coluna;
    const texto = `${medalhasDaAtividade.length} ${medalhasDaAtividade.length === 1 ? 'recorde pessoal' : 'recordes pessoais'}: ${medalhasDaAtividade.map((m) => m.rotulo).join(', ')}`;
    const emblema = h(
      'div',
      { class: `ativ-emblema ativ-emblema-${escopo}`, role: 'button', 'aria-label': texto },
      h('span', { class: 'ativ-emblema-circulo' }, icone(escopo === 'ouro' ? 'esporte' : 'medalha', 22), medalhasDaAtividade.length > 1 ? h('span', { class: 'ativ-emblema-qtd', 'aria-hidden': 'true' }, String(medalhasDaAtividade.length)) : null),
      h('span', { class: 'ativ-emblema-nome' }, ROTULO_DO_EMBLEMA[escopo]),
    );
    medalhaCartao.ligar(emblema, a, medalhasDaAtividade);
    coluna.append(emblema);
    return coluna;
  }

  /** Uma métrica da camada 2: ícone e rótulo em cinza, valor em destaque embaixo ("—" quando vazio). */
  function metrica(nomeIcone, rotulo, valor, classe = '') {
    return h('div', { class: `ativ-metrica ${classe}`.trim() }, h('span', { class: 'ativ-metrica-rotulo' }, icone(nomeIcone, 16), rotulo), h('strong', { class: 'ativ-metrica-valor' }, valor));
  }

  /**
   * Card de duas camadas. Camada 1: miniatura, identificação (esporte, data, título e badges), origem e "Abrir". Camada 2: as
   * oito métricas. O CSS decide pela largura do card se as camadas ficam empilhadas ou na mesma linha.
   */
  function linha(a) {
    const origem = ROTULO_ORIGEM_HRSS[a.hrssOrigem];
    const fonte = origemDaAtividade(a);
    const medalhasDaAtividade = medalhas.get(a.id);
    const escopoDaLinha = melhorMedalha(medalhasDaAtividade);
    const rotuloEsporte = ROTULO_ESPORTE[a.esporte] ?? a.esporte;
    const titulo = a.titulo || rotuloEsporte;
    const li = h(
      'li',
      // só o pódio marca a linha (faixa lateral de 3px); a medalha recente é só o badge
      { class: `ativ-linha ativ-linha-clicavel${escopoDaLinha && escopoDaLinha !== 'recente' ? ` ativ-linha-medalha ativ-linha-medalha-${escopoDaLinha}` : ''}` },
      // a origem (Garmin, arquivo ou cadastro manual) é uma "orelha" no canto superior direito do card
      h('span', { class: `ativ-orelha ativ-orelha-${fonte.id}`, role: 'img', 'aria-label': fonte.rotulo }, icone(fonte.icone, 14)),
      h(
        'div',
        { class: 'ativ-cartao' },
        h(
          'div',
          { class: 'ativ-id' },
          miniaturas.criar(a),
          h(
            'div',
            { class: 'ativ-ident' },
            miniaturas.marca(a),
            h(
              'div',
              { class: 'ativ-ident-topo' },
              h('span', { class: 'ativ-esporte-mini', role: 'img', 'aria-label': rotuloEsporte }, iconeDoEsporte(a.esporte)),
              h('span', { class: 'ativ-data-dia' }, icone('calendario', 14), dataCurtaDaAtividade(a.data)),
            ),
            h('a', { class: `ativ-titulo${a.titulo ? '' : ' ativ-titulo-padrao'}`, href: `#/atividades/${a.id}`, title: titulo }, titulo),
            faixaDeBadges.faixa(badgesDaAtividade(a)),
          ),
          emblemaDaMedalha(a, medalhasDaAtividade, escopoDaLinha),
          h('a', { class: 'btn btn-secundario ativ-abrir', href: `#/atividades/${a.id}`, 'aria-label': `Abrir a atividade de ${formatarData(a.data)}` }, 'Abrir'),
        ),
        h(
          'div',
          { class: 'ativ-metricas' },
          metrica('rota', 'Distância', formatarDistancia(a.distanciaM)),
          metrica('cronometro', 'Duração', formatarDuracao(a.duracaoS)),
          metrica('velocimetro', a.esporte === 'corrida' ? 'Ritmo' : 'Vel. média', textoVelocidade(a)),
          metrica('elevacao', 'Elevação', metros(a.altimetriaM)),
          metrica('fcPulso', 'FC média', a.fcMedia ? `${a.fcMedia} bpm` : '—'),
          metrica('hrss', 'Potência', a.potenciaOrigem && Number.isFinite(a.potenciaMediaW) ? [`${formatarNumero(a.potenciaMediaW, 0)} W`, a.potenciaOrigem === 'estimada' ? h('small', { class: 'dica', title: 'Potência estimada por velocidade, subida e peso' }, ' est.') : null] : '—'),
          metrica(iconeDoClima(a.climaCodigo), 'Clima', Number.isFinite(a.temperaturaMediaC) ? h('span', { title: condicaoDoClima(a.climaCodigo) ?? undefined }, `${formatarNumero(a.temperaturaMediaC, 0)} °C`) : '—'),
          metrica('atividades', 'HRSS', [
            a.hrss === null || a.hrss === undefined ? h('span', { class: 'badge badge-aviso', title: 'HRSS não calculado' }, 'sem HRSS') : formatarNumero(a.hrss, 1),
            origem && a.hrssOrigem !== 'fc' ? h('small', { class: 'dica', title: `HRSS ${origem}` }, ` (${a.hrssOrigem})`) : null,
            a.alertas?.length ? h('span', { class: 'badge badge-aviso', title: 'Há avisos nesta atividade' }, '!') : null,
          ]),
        ),
      ),
    );
    // popover explicativo de cada dado do card (os clicáveis, como os badges e o botão, e a medalha têm ação ou popover próprio)
    const IDS_DAS_METRICAS = ['distancia', 'duracao', 'velocidade', 'elevacao', 'fc', 'potencia', 'clima', 'hrss'];
    li.querySelectorAll('.ativ-metricas > .ativ-metrica').forEach((el, i) => popovers.ligar(el, guiaDoDado(IDS_DAS_METRICAS[i], a, { condicao: condicaoDoClima(a.climaCodigo) })));
    popovers.ligar(li.querySelector('.ativ-mini'), guiaDoDado('miniatura', a));
    if (fonte.id !== 'manual') popovers.ligar(li.querySelector('.ativ-orelha'), guiaDoDado('origem', a, { fonte }));
    // clicar na linha abre a atividade; os badges (como o "Como foi?"), os links e a medalha têm ação própria
    li.addEventListener('click', (e) => {
      if (e.target.closest('a, button, [role="button"], [data-guia]')) return;
      window.location.hash = `#/atividades/${a.id}`;
    });
    return li;
  }

  function desenharPaginacao(total, inicio, naPagina, totalPaginas) {
    const irPara = (pagina) => () => {
      estadoAtividades.pagina = pagina;
      desenharTabela();
      corpo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const seta = (nome, rotulo, destino, desligada) =>
      h('button', { type: 'button', class: 'ativ-pag-seta', title: rotulo, 'aria-label': rotulo, disabled: desligada, onClick: irPara(destino) }, icone(nome, 18));
    const tamanhoPagina = seletor({ rotulo: 'Atividades por página', opcoes: OPCOES_POR_PAGINA.map((n) => ({ valor: String(n), rotulo: String(n) })), valor: String(estadoAtividades.porPagina) });
    tamanhoPagina.addEventListener('change', () => {
      estadoAtividades.porPagina = Number(tamanhoPagina.value);
      estadoAtividades.pagina = 1;
      desenharTabela();
    });
    const { pagina } = estadoAtividades;
    paginacao.replaceChildren(
      h('label', { class: 'ativ-pag-tamanho' }, 'Atividades por página', tamanhoPagina),
      h('span', { class: 'ativ-pag-faixa' }, h('strong', null, `${inicio + 1}–${inicio + naPagina}`), ` de ${total}`),
      h(
        'div',
        { class: 'ativ-pag-nav' },
        seta('chevronEsq', 'Página anterior', pagina - 1, pagina <= 1),
        h('span', { class: 'ativ-pag-pagina', 'aria-live': 'polite' }, `Página ${pagina} de ${totalPaginas}`),
        seta('chevronDir', 'Próxima página', pagina + 1, pagina >= totalPaginas),
      ),
    );
  }

  function desenharTabela() {
    const base = visiveis().filter((a) => !estadoAtividades.soRecordes || medalhas.get(a.id)?.length > 0);
    const lista = filtrarEOrdenar([...base]);
    contagem.textContent = `${lista.length} de ${base.length} atividade${base.length === 1 ? '' : 's'}`;
    popovers.fechar();
    medalhaCartao.esconder();
    faixaDeBadges.esconder();
    miniaturas.reiniciar();
    if (lista.length === 0) {
      paginacao.replaceChildren();
      corpo.replaceChildren(
        h('p', { class: 'vazio' }, atividades.length === 0 ? 'Nenhuma atividade ainda. Importe um arquivo ou registre uma manualmente.' : 'Nenhuma atividade neste período ou filtro.'),
      );
      return;
    }
    const { porPagina } = estadoAtividades;
    const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
    estadoAtividades.pagina = Math.min(Math.max(1, estadoAtividades.pagina), totalPaginas);
    const inicio = (estadoAtividades.pagina - 1) * porPagina;
    const daPagina = lista.slice(inicio, inicio + porPagina);
    desenharPaginacao(lista.length, inicio, daPagina.length, totalPaginas);
    corpo.replaceChildren(h('ul', { class: 'ativ-lista' }, ...daPagina.map(linha)));
  }

  function atualizarAviso() {
    aviso.hidden = true;
    if (configs === null) return;
    const irParaConfiguracao = h('a', { href: '#/configuracao' }, 'Ir para Configuração');
    if (configs.length === 0) {
      aviso.className = 'mensagem';
      aviso.replaceChildren('Cadastre a sua configuração de FC para calcular o HRSS. ', irParaConfiguracao);
      aviso.hidden = false;
      return;
    }
    // Atividades que o servidor deixou sem HRSS por não haver configuração vigente na data delas.
    const semHrss = atividades.filter((a) => a.alertas?.includes('semConfigFc'));
    if (semHrss.length === 0) return;
    const vigencias = configs.map((c) => c.vigenteDesde);
    const faltaCobertura = atividadesAntesDaPrimeiraVigencia(vigencias, semHrss.map((a) => a.data)) > 0;
    const quantas = semHrss.length === 1 ? '1 atividade está' : `${semHrss.length} atividades estão`;
    aviso.className = 'mensagem';
    aviso.replaceChildren(
      faltaCobertura
        ? `${quantas} sem HRSS: a sua configuração mais antiga vale desde ${formatarData(primeiraVigencia(vigencias))}, depois delas. Ajuste essa data para antes da atividade mais antiga e use “Recalcular histórico”. `
        : `${quantas} sem HRSS, mas já existe configuração vigente nas datas dela${semHrss.length === 1 ? '' : 's'}. Use “Recalcular histórico” para calcular. `,
      irParaConfiguracao,
    );
    aviso.hidden = false;
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'ativ-pagina' },
      h(
        'header',
        { class: 'ativ-cabecalho' },
        h('div', null, h('h1', null, 'Atividades'), h('p', { class: 'texto-secundario' }, 'Seu histórico de treinos, recordes e totais por período.')),
        h(
          'div',
          { class: 'linha-botoes' },
          botaoGarmin,
          h('button', { class: 'btn', type: 'button', onClick: () => mostrarPainel('importar', abrirImportar) }, 'Importar arquivo'),
          h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => mostrarPainel('manual', abrirManual) }, 'Registrar manualmente'),
        ),
      ),
      mensagemGarmin.el,
      aviso,
      paineis,
      filtros,
      resumo,
      recordes,
      h(
        'section',
        { class: 'card ativ-tabela-card' },
        h('div', { class: 'barra-tabela' }, busca, chipsDaLista, ordenar, contagem),
        h(
          'p',
          { class: 'ativ-legenda' },
          h('span', null, h('i', { class: 'ativ-legenda-faixa ativ-legenda-ouro' }), h('i', { class: 'ativ-legenda-faixa ativ-legenda-prata' }), h('i', { class: 'ativ-legenda-faixa ativ-legenda-bronze' }), 'Faixa colorida: recorde pessoal (ouro, prata ou bronze)'),
          h('span', null, h('i', { class: 'ativ-legenda-faixa ativ-legenda-nenhuma' }), 'Sem faixa: atividade comum'),
        ),
        mensagem.el,
        corpo,
        paginacao,
      ),
    ),
  );
  corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  cancelar.push(
    observarAtividades(
      sessao.uid,
      (lista) => {
        atividades = lista;
        medalhas = medalhasDasAtividades(lista, hoje);
        guardarAtividadesParaMedalhas(sessao.uid, lista);
        desenharTudo();
        atualizarAviso();
      },
      () => mensagem.mostrar('Não foi possível carregar as atividades.'),
    ),
    observarEstresseDiario(
      sessao.uid,
      (dias) => {
        serieForma = dias.length > 0 ? montarSerie(dias, hoje) : [];
        desenharRecordes();
      },
      () => {},
    ),
    observarTreinosVinculados(
      sessao.uid,
      (treinos) => {
        treinosVinculados = new Map(treinos.filter((x) => x.atividadeId).map((x) => [x.atividadeId, x]));
        desenharTabela();
      },
      () => {}, // sem os treinos, os badges mostram "sem vínculo"
    ),
    observarTrajetos(
      sessao.uid,
      (trajetos) => {
        nomesDosTrajetos = new Map(trajetos.map((x) => [x.id, x.nome]));
        desenharTabela();
      },
      () => {},
    ),
    observarConfigs(
      sessao.uid,
      (lista) => {
        configs = lista;
        atualizarAviso();
      },
      () => {},
    ),
  );

  // Pedido feito de outra tela: a flag é consumida ao montar.
  if (estadoAtividades.abrirImportar) {
    estadoAtividades.abrirImportar = false;
    abrirPainelDeImportacao();
  }

  return () => {
    window.removeEventListener(EVENTO_IMPORTAR, abrirPainelDeImportacao);
    cancelar.forEach((fn) => fn());
    popovers.fechar();
    medalhaCartao.destruir();
    faixaDeBadges.destruir();
    miniaturas.reiniciar();
  };
}
