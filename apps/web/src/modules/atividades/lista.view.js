import { anosComAtividades, atividadePrecisaCompletar, esforcosDoEsporte, medalhasDasAtividades, melhorMedalha, melhoresEsforcosDasAtividades, VERSAO_DO_DETALHE, VERSAO_DOS_ESFORCOS, intervaloDoPeriodo, maiorCondicionamento, maiorSequenciaDeSemanas, RECURSOS, semanaMaisPesada, atividadesAntesDaPrimeiraVigencia, filtrarPorPeriodo, PERIODOS_RAPIDOS, primeiraVigencia, recordesDasAtividades, resumoDasAtividades, temRecurso, velocidadeMediaMs } from '@no-strova/domain';
import { montarSerie } from '../../application/forma.js';
import { obterSessao } from '../../application/sessao.js';
import { completarAtividades } from '../../application/completarAtividades.js';
import { guardarAtividadesParaMedalhas } from '../../application/medalhas.js';
import { garminSituacao, stravaSituacao } from '../../core/functions.js';
import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { avisoDispensavel } from '../../utils/avisoDispensavel.js';
import { areaMensagem } from '../../utils/componentes.js';
import { LIMITE_POR_FONTE, resumoSincronizacao, semNovidades, sincronizarAtividades } from '../configuracao/sincronizacao.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { tempoDeEsforco, ritmoTexto } from './esforcos.js';
import { painelImportar } from './importar.js';
import { painelManual } from './manual.js';
import { criarCartaoDeMedalhas } from './medalhaCartao.js';
import { criarPrevia } from './previa.js';
import { alternarOrdem, estadoAtividades, EVENTO_IMPORTAR } from './state.js';
import { OPCOES_ESPORTE, ROTULO_ESPORTE, ROTULO_ORIGEM_HRSS } from './textos.js';

const COLUNAS = [
  { campo: 'data', rotulo: 'Data / Nome' },
  { campo: 'esporte', rotulo: 'Esporte' },
  { campo: 'duracaoS', rotulo: 'Duração' },
  { campo: 'distanciaM', rotulo: 'Distância' },
  { campo: 'velocidadeMs', rotulo: 'Vel. média' },
  { campo: 'altimetriaM', rotulo: 'Elevação' },
  { campo: 'fcMedia', rotulo: 'FC média' },
  { campo: 'hrss', rotulo: 'HRSS' },
  { campo: 'fonteOrdem', rotulo: 'Origem' },
  { campo: null, rotulo: 'Abrir' },
];

const OPCOES_POR_PAGINA = [10, 25, 50, 100];

/** De onde veio a atividade: sincronizada do Garmin ou do Strava (`fonte`), arquivo enviado ou cadastro manual (`origem`). */
function origemDaAtividade(a) {
  if (a.fonte === 'garmin') return { id: 'garmin', rotulo: 'Garmin Connect', icone: 'garmin' };
  if (a.fonte === 'strava') return { id: 'strava', rotulo: 'Strava', icone: 'garmin' };
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
  esforcosDoEsporte(esporte).map((e) => ({ id: `${e.id}-${esporte}`, rotulo: `Melhor ${e.rotulo} · ${ROTULO_ESPORTE[esporte] ?? esporte}`, icone: 'duracao', formatar: tempoDeEsforco, esforcoM: e.metros, esporte }));

/** O cálculo do histórico roda sozinho uma vez por abertura do app (o botão continua para tentar de novo). */
let calculoAutomaticoIniciado = false;

const CARDS_DE_RECORDE = [
  { id: 'distancia', rotulo: 'Maior distância', icone: 'distancia', formatar: (v) => formatarDistancia(v) },
  { id: 'duracao', rotulo: 'Maior tempo', icone: 'duracao', formatar: (v) => formatarDuracao(v) },
  { id: 'elevacao', rotulo: 'Maior elevação', icone: 'elevacao', formatar: metros },
  { id: 'hrss', rotulo: 'Maior HRSS', icone: 'hrss', formatar: (v) => formatarNumero(v, 1) },
  { id: 'fcMax', rotulo: 'Maior FC máxima', icone: 'fc', formatar: (v) => `${formatarNumero(v, 0)} bpm` },
  { id: 'semanaPesada', rotulo: 'Semana mais pesada', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} HRSS` },
  { id: 'sequencia', rotulo: 'Maior sequência', icone: 'plano', formatar: (v) => `${v} semana${v === 1 ? '' : 's'}` },
  { id: 'condicionamento', rotulo: 'Maior Condicionamento', icone: 'atividades', formatar: (v) => formatarNumero(v, 1), geral: true },
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
  const cancelar = [];
  const mensagem = areaMensagem();
  const aviso = h('p', { class: 'mensagem', hidden: true });
  const mensagemGarmin = avisoDispensavel();
  const corpo = h('div', { class: 'tabela-wrap' });
  const paineis = h('div');
  const contagem = h('span', { class: 'texto-secundario' });
  const paginacao = h('nav', { class: 'ativ-paginacao', 'aria-label': 'Paginação das atividades' });
  const previa = criarPrevia({ textoVelocidade, iconeDoEsporte });
  // a medalha abre o cartão de recordes no lugar da prévia do mapa
  const medalhaCartao = criarCartaoDeMedalhas({ aoAbrir: () => previa.esconder() });

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
  const hoje = hojeIso();
  const filtros = h('div', { class: 'ativ-filtros' });
  const resumo = h('div', { class: 'ativ-resumo' });
  const recordes = h('section', { class: 'ativ-recordes' });

  /** Atividades visíveis: esporte e período escolhidos. */
  const visiveis = () => filtrarPorPeriodo(doEsporte(atividades), estadoAtividades.periodo, hoje).map((a) => ({ ...a, velocidadeMs: velocidadeMediaMs(a) }));

  function chip(rotulo, ativo, aoClicar, conteudo = null) {
    return h('button', { type: 'button', class: `ativ-chip${ativo ? ' ativo' : ''}`, 'aria-pressed': String(ativo), onClick: aoClicar }, conteudo, rotulo);
  }

  function desenharTudo() {
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
    const seletorAno = h(
      'select',
      {
        class: `ativ-ano${periodo.startsWith('ano:') ? ' ativo' : ''}`,
        'aria-label': 'Escolher um ano',
        onChange: (e) => {
          if (!e.target.value) return;
          estadoAtividades.periodo = e.target.value;
          estadoAtividades.pagina = 1;
          desenharTudo();
        },
      },
      h('option', { value: '' }, 'Ano…'),
      ...anos.map((a) => h('option', { value: `ano:${a}`, selected: periodo === `ano:${a}` }, String(a))),
    );
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

  /** Botão que calcula o melhor 5 km e 10 km das atividades importadas antes desse recurso (o servidor relê os arquivos). */
  function botaoDeEsforcos(pendentes) {
    const estado = h('span', { class: 'texto-secundario ativ-esforcos-estado' });
    const botao = h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button' }, `Calcular melhores esforços e zonas do histórico (${pendentes} atividade${pendentes === 1 ? '' : 's'})`);
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      let feitas = 0;
      try {
        estado.textContent = ` Calculando… ${feitas} de ${pendentes}`;
        feitas = await completarAtividades((n) => {
          estado.textContent = ` Calculando… ${n} de ${pendentes}`;
        });
        estado.textContent = ' Pronto.';
      } catch (err) {
        estado.textContent = ` ${err.message || 'Não foi possível calcular agora.'}`;
        botao.disabled = false;
      }
    });
    return h('p', { class: 'ativ-esforcos' }, botao, estado);
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
    const cartoes = comEsforcos.filter((c) => !c.esforcoM || atividades.some((a) => a.esporte === c.esporte && a.distanciaM >= c.esforcoM));
    const botaoCalculo = pendentes > 0 ? botaoDeEsforcos(pendentes) : null;
    if (botaoCalculo && !calculoAutomaticoIniciado) {
      calculoAutomaticoIniciado = true;
      setTimeout(() => botaoCalculo.querySelector('button')?.click(), 0);
    }
    recordes.replaceChildren(
      h('div', { class: 'ativ-recordes-topo' }, h('h2', null, 'Recordes'), h('p', { class: 'texto-secundario' }, subtitulo), botaoCalculo),
      h(
        'div',
        { class: 'ativ-recordes-grade' },
        ...cartoes.map((c) => {
          const r = doPeriodo[c.id];
          const hist = historicos[c.id];
          const ehHistorico = Boolean(r && hist && r.atividade.id === hist.atividade.id);
          return h(
            'article',
            { class: `ativ-recorde${ehHistorico ? ' ativ-recorde-historico' : ''}` },
            h(
              'div',
              { class: 'ativ-recorde-topo' },
              h('span', { class: 'ativ-recorde-icone' }, icone(c.icone, 18)),
              h('span', { class: 'ativ-recorde-rotulo' }, c.rotulo),
            ),
            h('strong', { class: 'ativ-recorde-valor' }, r ? c.formatar(r.valor) : '—'),
            h(
              'div',
              { class: 'ativ-recorde-rodape' },
              r?.atividade.semLink
                ? h('span', { class: 'ativ-recorde-quando' }, r.atividade.quando)
                : r
                ? h('a', { class: 'ativ-recorde-quando', href: `#/atividades/${r.atividade.id}` }, iconeDoEsporte(r.atividade.esporte), formatarData(r.atividade.data), c.esforcoM ? ` · ${ritmoTexto(r.atividade.esporte, r.valor, c.esforcoM)}` : '')
                : h('span', { class: 'ativ-recorde-quando texto-secundario' }, 'Sem registro'),
              c.geral ? h('span', { class: 'ativ-selo ativ-selo-geral', title: 'Vale para todos os esportes: não segue o filtro de esporte' }, 'Geral') : null,
              ehHistorico && !todos ? h('span', { class: 'ativ-selo', title: 'É o recorde de todos os tempos' }, icone('esporte', 14), 'Histórico') : null,
            ),
            !todos && hist && !ehHistorico
              ? h(hist.atividade.semLink ? 'span' : 'a', { class: 'ativ-recorde-hist', ...(hist.atividade.semLink ? {} : { href: `#/atividades/${hist.atividade.id}` }) }, `Histórico: ${c.formatar(hist.valor)} · ${hist.atividade.quando ?? formatarData(hist.atividade.data)}`)
              : null,
          );
        }),
      ),
    );
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

  /**
   * Sincroniza sem sair da tela, com a fonte que o usuário conectou em Configuração (Garmin ou Strava; é uma só).
   * Só aparece para quem tem uma fonte conectada. A lista se atualiza sozinha (onSnapshot).
   */
  const FONTES = [
    { fonte: 'garmin', recurso: RECURSOS.GARMIN, nome: 'Garmin Connect', situacao: garminSituacao },
    { fonte: 'strava', recurso: RECURSOS.STRAVA, nome: 'Strava', situacao: stravaSituacao },
  ];
  let fonteAtiva = null;
  const botaoGarmin = h('button', {
    class: 'btn-garmin',
    type: 'button',
    hidden: true,
    title: 'Sincronizar atividades',
    'aria-label': 'Sincronizar atividades',
  }, icone('garmin', 22));
  function usarFonte(f) {
    fonteAtiva = f;
    botaoGarmin.hidden = !f;
    botaoGarmin.classList.toggle('btn-strava', f?.fonte === 'strava');
    const texto = f ? `Sincronizar com o ${f.nome}` : 'Sincronizar atividades';
    botaoGarmin.title = texto;
    botaoGarmin.setAttribute('aria-label', texto);
  }
  botaoGarmin.addEventListener('click', async () => {
    const f = fonteAtiva;
    if (!f) return;
    botaoGarmin.disabled = true;
    botaoGarmin.classList.add('carregando');
    mensagemGarmin.limpar();
    try {
      const situacao = await f.situacao();
      if (!situacao.conectado) {
        usarFonte(null);
        mensagemGarmin.mostrar(`O ${f.nome} não está mais conectado. Conecte de novo em Configuração.`);
        return;
      }
      mensagemGarmin.mostrar(`Sincronizando com o ${f.nome}…`, 'carregando');
      const primeira = !situacao.ultimaSincronizacao;
      const { total, limitado } = await sincronizarAtividades({ fonte: f.fonte, dias: primeira ? 30 : undefined });
      const vazio = primeira ? 'Nos últimos 30 dias, nenhuma atividade foi encontrada.' : 'Desde a última sincronização, nenhuma atividade foi encontrada.';
      mensagemGarmin.mostrar(resumoSincronizacao(total, limitado, vazio, LIMITE_POR_FONTE[f.fonte]), semNovidades(total) ? 'info' : 'ok');
    } catch (err) {
      mensagemGarmin.mostrar(err.message || `Não foi possível sincronizar com o ${f.nome}.`);
    } finally {
      botaoGarmin.disabled = false;
      botaoGarmin.classList.remove('carregando');
    }
  });

  // Só consulta as fontes que o administrador liberou; sem estado, o botão fica escondido.
  const perfilDaSessao = obterSessao().perfil;
  Promise.all(
    FONTES.filter((f) => temRecurso(perfilDaSessao, f.recurso)).map((f) =>
      f.situacao().then(
        (situacao) => (situacao.conectado ? f : null),
        () => null,
      ),
    ),
  ).then((conectadas) => usarFonte(conectadas.find(Boolean) ?? null));

  /** Selo de medalha ao lado da data (a medalha mais alta da atividade). Ao passar o mouse, abre o cartão com os recordes. */
  function medalhaDaLinha(a, lista, escopo) {
    if (!escopo) return null;
    const texto = `${lista.length} ${lista.length === 1 ? 'recorde pessoal' : 'recordes pessoais'}: ${lista.map((m) => m.rotulo).join(', ')}`;
    const selo = h('span', { class: `medalha-selo medalha-selo-${escopo}`, tabindex: '0', role: 'button', 'aria-label': texto }, icone('medalha', 20));
    medalhaCartao.ligar(selo, a, lista);
    return selo;
  }

  function linha(a) {
    const origem = ROTULO_ORIGEM_HRSS[a.hrssOrigem];
    const fonte = origemDaAtividade(a);
    const medalhasDaAtividade = medalhas.get(a.id);
    const escopoDaLinha = melhorMedalha(medalhasDaAtividade);
    const tr = h(
      'tr',
      // só o pódio colore a linha toda; a medalha recente é um selo menor, sem destaque na linha
      escopoDaLinha && escopoDaLinha !== 'recente' ? { class: `ativ-linha-medalha ativ-linha-medalha-${escopoDaLinha}` } : null,
      // data pequena em cima e o nome embaixo (o do usuário ou, sem ele, o esporte): duas linhas curtas, que não aumentam a altura da linha
      h(
        'td',
        null,
        h(
          'div',
          { class: 'ativ-celula-nome' },
          h(
            'a',
            { class: 'ativ-data', href: `#/atividades/${a.id}`, title: a.titulo || undefined },
            h('span', { class: 'ativ-data-dia' }, formatarData(a.data)),
            h('span', { class: `ativ-nome${a.titulo ? '' : ' ativ-nome-padrao'}` }, a.titulo || (ROTULO_ESPORTE[a.esporte] ?? a.esporte)),
          ),
          medalhaDaLinha(a, medalhasDaAtividade, escopoDaLinha),
        ),
      ),
      h('td', null, h('span', { class: 'ativ-esporte' }, h('span', { class: 'ativ-esporte-icone' }, iconeDoEsporte(a.esporte)), ROTULO_ESPORTE[a.esporte] ?? a.esporte)),
      h('td', null, formatarDuracao(a.duracaoS)),
      h('td', null, formatarDistancia(a.distanciaM)),
      h('td', null, textoVelocidade(a)),
      h('td', null, metros(a.altimetriaM)),
      h('td', null, a.fcMedia ? `${a.fcMedia} bpm` : '—'),
      h(
        'td',
        null,
        a.hrss === null || a.hrss === undefined ? h('span', { class: 'badge badge-aviso', title: 'HRSS não calculado' }, 'sem HRSS') : formatarNumero(a.hrss, 1),
        origem && a.hrssOrigem !== 'fc' ? h('small', { class: 'dica', title: `HRSS ${origem}` }, ` (${a.hrssOrigem})`) : null,
        a.alertas?.length ? h('span', { class: 'badge badge-aviso', title: 'Há avisos nesta atividade' }, '!') : null,
      ),
      h(
        'td',
        null,
        h('span', { class: `ativ-origem ativ-origem-${fonte.id}`, title: fonte.rotulo, role: 'img', 'aria-label': fonte.rotulo }, icone(fonte.icone, 16)),
      ),
      h(
        'td',
        { class: 'ativ-col-abrir' },
        h('a', { class: 'ativ-olho', href: `#/atividades/${a.id}`, title: 'Abrir a atividade', 'aria-label': `Abrir a atividade de ${formatarData(a.data)}` }, icone('olho', 20)),
      ),
    );
    previa.ligar(tr, a);
    return tr;
  }

  function desenharPaginacao(total, inicio, naPagina, totalPaginas) {
    const irPara = (pagina) => () => {
      estadoAtividades.pagina = pagina;
      desenharTabela();
      corpo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const seta = (nome, rotulo, destino, desligada) =>
      h('button', { type: 'button', class: 'ativ-pag-seta', title: rotulo, 'aria-label': rotulo, disabled: desligada, onClick: irPara(destino) }, icone(nome, 18));
    const seletor = h(
      'select',
      {
        'aria-label': 'Atividades por página',
        onChange: (e) => {
          estadoAtividades.porPagina = Number(e.target.value);
          estadoAtividades.pagina = 1;
          desenharTabela();
        },
      },
      ...OPCOES_POR_PAGINA.map((n) => h('option', { value: String(n), selected: n === estadoAtividades.porPagina }, String(n))),
    );
    const { pagina } = estadoAtividades;
    paginacao.replaceChildren(
      h('label', { class: 'ativ-pag-tamanho' }, 'Atividades por página', seletor),
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
    const base = visiveis();
    const lista = filtrarEOrdenar([...base]);
    contagem.textContent = `${lista.length} de ${base.length} atividade${base.length === 1 ? '' : 's'}`;
    previa.esconder();
    medalhaCartao.esconder();
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
    const { campo, direcao } = estadoAtividades.ordem;
    const cabecalho = COLUNAS.map((c) =>
      !c.campo
        ? h('th', { scope: 'col', class: 'ativ-col-abrir' }, c.rotulo)
        : h(
        'th',
        { scope: 'col', 'aria-sort': c.campo === campo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              alternarOrdem(c.campo);
              estadoAtividades.pagina = 1;
              desenharTabela();
            },
          },
          c.rotulo + (c.campo === campo ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''),
        ),
      ),
    );
    corpo.replaceChildren(
      h('table', { class: 'tabela tabela-atividades' }, h('thead', null, h('tr', null, ...cabecalho)), h('tbody', null, ...daPagina.map(linha))),
    );
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
      h('section', { class: 'card ativ-tabela-card' }, h('div', { class: 'barra-tabela' }, busca, contagem), mensagem.el, corpo, paginacao),
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
    previa.destruir();
    medalhaCartao.destruir();
  };
}
