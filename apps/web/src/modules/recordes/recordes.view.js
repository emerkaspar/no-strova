import { anosComAtividades, atividadePrecisaCompletar, filtrarPorPeriodo, intervaloDoPeriodo, PERIODOS_RAPIDOS, somarDias, velocidadeMediaMs, VERSAO_DO_DETALHE, VERSAO_DOS_ESFORCOS } from '@no-strova/domain';
import { completarAtividades } from '../../application/completarAtividades.js';
import { montarSerie } from '../../application/forma.js';
import { marcarConquistasComoVistas } from '../../core/functions.js';
import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarConquistas } from '../../infrastructure/conquistasRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { colunasDe } from '../../utils/abas.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { paginaTopo } from '../../utils/paginaTopo.js';
import { ritmoTexto } from '../atividades/esforcos.js';
import { prateleiraDeConquistas } from '../progressao/objetivos.js';
import { calcularRecordes, CARDS_DE_RECORDE, cartoesDeEsforco, GRUPOS_DE_RECORDE } from './cartoes.js';
import { estadoRecordes } from './state.js';

/** O cálculo do histórico roda sozinho uma vez por abertura do app (o botão continua para tentar de novo). */
let calculoAutomaticoIniciado = false;

const iconeDoEsporte = (esporte) => icone(esporte === 'ciclismo' || esporte === 'corrida' ? esporte : 'outro', 16);

const DESCRICAO_DO_GRUPO = {
  esforcos: 'O trecho contínuo mais rápido de 5 km e de 10 km dentro de uma atividade.',
  potencia: 'Seus maiores números de potência no ciclismo (medida e estimada).',
  clima: 'As condições mais extremas em que você treinou.',
  carga: 'Quanto você aguentou de carga e de constância, semana a semana.',
};

/** Atividades do esporte escolhido (todas, com "Todos"). */
const doEsporte = (atividades) => atividades.filter((a) => !estadoRecordes.esporte || a.esporte === estadoRecordes.esporte);

export function render(raiz, sessao) {
  const hoje = hojeIso();
  let atividades = [];
  let conquistas = [];
  let serieForma = [];
  const carregou = { atividades: false, conquistas: false };
  const avisadas = new Set(); // conquistas já marcadas como vistas nesta tela
  let temporizador = null;
  const cancelar = [];
  const mensagem = areaMensagem();

  const filtros = h('div', { class: 'ativ-filtros' });
  const destaques = h('div', { class: 'rcd-destaques' });
  const recordes = h('div', { class: 'rcd-secoes' });
  const secaoConquistas = h('div', { class: 'rcd-secoes' });
  // barra fixa de âncoras (como no Plano e na Progressão): o elemento é único para o sticky valer; os botões são refeitos a cada desenho
  const ancoras = h('nav', { class: 'plano-ancoras', 'aria-label': 'Seções dos recordes', hidden: true });
  let secoes = []; // { id, rotulo } das seções que aparecem agora
  let secaoVisivel = null;
  let observador = null;

  const secaoEl = (id) => document.getElementById(`rcd-${id}`);
  const irParaSecao = (id) => secaoEl(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  function desenharAncoras() {
    secoes = [...recordes.querySelectorAll('[data-secao]'), ...secaoConquistas.querySelectorAll('[data-secao]')].map((el) => ({ id: el.dataset.secao, rotulo: el.dataset.rotulo }));
    ancoras.hidden = secoes.length === 0;
    if (!secoes.some((x) => x.id === secaoVisivel)) secaoVisivel = secoes[0]?.id ?? null;
    ancoras.replaceChildren(...secoes.map((x) => h('button', { class: 'plano-ancora', type: 'button', 'data-secao': x.id, 'aria-current': secaoVisivel === x.id ? 'true' : null, onClick: () => irParaSecao(x.id) }, x.rotulo)));
    observador?.disconnect();
    observador = null;
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Set();
    observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.dataset.secao);
          else visiveis.delete(e.target.dataset.secao);
        }
        const atual = secoes.find((x) => visiveis.has(x.id))?.id;
        if (atual && atual !== secaoVisivel) {
          secaoVisivel = atual;
          ancoras.querySelectorAll('.plano-ancora').forEach((b) => b.setAttribute('aria-current', String(b.dataset.secao === atual)));
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const x of secoes) {
      const el = secaoEl(x.id);
      if (el) observador.observe(el);
    }
  }

  /** Atividades visíveis: esporte e período escolhidos. */
  const visiveis = () => filtrarPorPeriodo(doEsporte(atividades), estadoRecordes.periodo, hoje).map((a) => ({ ...a, velocidadeMs: velocidadeMediaMs(a) }));

  const chip = (rotulo, ativo, aoClicar, conteudo = null) => h('button', { type: 'button', class: `ativ-chip${ativo ? ' ativo' : ''}`, 'aria-pressed': String(ativo), onClick: aoClicar }, conteudo, rotulo);

  function desenharTudo() {
    desenharFiltros();
    desenharRecordes();
    desenharConquistas();
    desenharAncoras();
  }

  function desenharFiltros() {
    const { periodo, esporte } = estadoRecordes;
    const anos = anosComAtividades(atividades);
    const escolherPeriodo = (id) => () => {
      estadoRecordes.periodo = id;
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
      estadoRecordes.periodo = seletorAno.value;
      desenharTudo();
    });
    const esportes = [
      ['', 'Todos', null],
      ['ciclismo', 'Ciclismo', icone('ciclismo', 16)],
      ['corrida', 'Corrida', icone('corrida', 16)],
    ];
    filtros.replaceChildren(
      h('div', { class: 'ativ-grupo', role: 'group', 'aria-label': 'Período' }, ...PERIODOS_RAPIDOS.map((p) => chip(p.rotulo, periodo === p.id, escolherPeriodo(p.id))), anos.length > 0 ? seletorAno : null),
      h(
        'div',
        { class: 'ativ-grupo', role: 'group', 'aria-label': 'Esporte' },
        ...esportes.map(([valor, rotulo, ic]) =>
          chip(
            rotulo,
            esporte === valor,
            () => {
              estadoRecordes.esporte = valor;
              desenharTudo();
            },
            ic,
          ),
        ),
      ),
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
      try {
        estado.textContent = `Calculando… 0 de ${pendentes}`;
        await completarAtividades((n) => {
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

  function tileDestaque(nomeIcone, valor, rotulo, nota) {
    return h('div', { class: 'rcd-destaque' }, h('span', { class: 'rcd-destaque-icone' }, icone(nomeIcone, 22)), h('div', null, h('strong', { class: 'rcd-destaque-valor' }, String(valor)), h('span', { class: 'rcd-destaque-rotulo' }, rotulo), h('small', null, nota)));
  }

  function desenharRecordes() {
    if (!carregou.atividades) {
      recordes.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      destaques.replaceChildren();
      return;
    }
    if (atividades.length === 0) {
      recordes.replaceChildren(h('div', { class: 'rcd-bloco' }, estadoVazio('Seus recordes aparecem aqui assim que você importar ou registrar a primeira atividade.')));
      destaques.replaceChildren();
      return;
    }
    const todos = estadoRecordes.periodo === 'tudo';
    // Melhor 5 km e 10 km: tempos só se comparam dentro de um esporte; "Todos" mostra um par por esporte.
    const esportesEsforco = estadoRecordes.esporte ? [estadoRecordes.esporte] : ['corrida', 'ciclismo'];
    const pendentes = atividades.filter((a) => atividadePrecisaCompletar(a, { versaoDosEsforcos: VERSAO_DOS_ESFORCOS, versaoDoDetalhe: VERSAO_DO_DETALHE })).length;
    const doPeriodo = calcularRecordes(visiveis(), { esportesEsforco, serieForma, intervalo: intervaloDoPeriodo(estadoRecordes.periodo, hoje), hoje });
    const historicos = todos ? doPeriodo : calcularRecordes(doEsporte(atividades), { esportesEsforco, serieForma, intervalo: null, hoje });
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

    const comRegistro = cartoes.filter((c) => doPeriodo[c.id]).length;
    const novos = cartoes.filter(ehNovo).length;
    destaques.replaceChildren(
      tileDestaque('esporte', comRegistro, comRegistro === 1 ? 'recorde registrado' : 'recordes registrados', todos ? 'De todos os tempos' : 'No período escolhido'),
      tileDestaque('chama', novos, novos === 1 ? 'recorde novo' : 'recordes novos', 'Batidos nos últimos 7 dias'),
      tileDestaque('medalha', conquistas.length, conquistas.length === 1 ? 'conquista' : 'conquistas', 'Badges de objetivos atingidos'),
    );

    function cartaoDeRecorde(c) {
      const r = doPeriodo[c.id];
      const hist = historicos[c.id];
      const ehHistorico = Boolean(r && hist && r.atividade.id === hist.atividade.id);
      const aux = r && !r.atividade.semLink && c.esforcoM ? ritmoTexto(r.atividade.esporte, r.valor, c.esforcoM) : null;
      const ouro = ehHistorico && !todos;
      return h(
        'article',
        { class: `rcd-card${r ? '' : ' rcd-card-vazio'}${ouro ? ' rcd-card-historico' : ''}${ehNovo(c) ? ' rcd-card-novo' : ''}` },
        h(
          'div',
          { class: 'rcd-card-topo' },
          h('span', { class: 'rcd-card-icone' }, icone(c.icone, 20)),
          ehNovo(c) ? h('span', { class: 'rec-novo', title: 'Recorde batido nos últimos 7 dias' }, 'Novo') : null,
          ouro ? h('span', { class: 'rcd-coroa', title: 'É o recorde de todos os tempos' }, icone('esporte', 14), 'Histórico') : null,
        ),
        h('span', { class: 'rcd-card-rotulo', title: c.rotuloCompleto ?? c.rotulo }, c.rotuloIcone ? icone(c.rotuloIcone, 14) : null, c.rotulo),
        h('strong', { class: 'rcd-card-valor' }, r ? c.formatar(r.valor) : '—'),
        h(
          'div',
          { class: 'rcd-card-rodape' },
          r?.atividade.semLink
            ? h('span', { class: 'rcd-card-quando' }, r.atividade.quando)
            : r
            ? h('a', { class: 'rcd-card-quando rcd-card-link', href: `#/atividades/${r.atividade.id}` }, iconeDoEsporte(r.atividade.esporte), formatarData(r.atividade.data))
            : h('span', { class: 'rcd-card-quando texto-secundario' }, 'Sem registro'),
          aux ? h('span', { class: 'rcd-card-aux' }, aux) : null,
          c.geral ? h('span', { class: 'rec-pill', title: 'Vale para todos os esportes: não segue o filtro de esporte' }, 'Geral') : null,
        ),
        !todos && hist && !ehHistorico
          ? h(hist.atividade.semLink ? 'span' : 'a', { class: 'rcd-card-hist', ...(hist.atividade.semLink ? {} : { href: `#/atividades/${hist.atividade.id}` }) }, `Histórico: ${c.formatar(hist.valor)} · ${hist.atividade.quando ?? formatarData(hist.atividade.data)}`)
          : null,
      );
    }

    recordes.replaceChildren(
      ...abas.map((g) =>
        h(
          'section',
          { class: 'rcd-bloco rcd-secao', id: `rcd-${g.id}`, 'data-secao': g.id, 'data-rotulo': g.nome },
          h('div', { class: 'rcd-secao-topo' }, h('span', { class: 'rcd-secao-icone' }, icone(g.icone, 22)), h('div', null, h('h2', null, g.titulo), h('p', { class: 'rcd-subtitulo' }, g.id === 'marcas' ? subtitulo : DESCRICAO_DO_GRUPO[g.id])), g.cartoes.some(ehNovo) ? h('span', { class: 'rec-novo' }, 'Novo') : null, g.id === 'marcas' ? botaoCalculo : null),
          h('div', { class: 'rcd-grade', style: `--cols:${colunasDe(g.cartoes.length)}` }, ...g.cartoes.map(cartaoDeRecorde)),
        ),
      ),
    );
  }

  function desenharConquistas() {
    if (!carregou.conquistas) {
      secaoConquistas.replaceChildren();
      return;
    }
    secaoConquistas.replaceChildren(
      h(
        'section',
        { class: 'rcd-bloco rcd-secao', id: 'rcd-conquistas', 'data-secao': 'conquistas', 'data-rotulo': 'Conquistas' },
        h('div', { class: 'rcd-secao-topo' }, h('span', { class: 'rcd-secao-icone' }, icone('medalha', 22)), h('div', null, h('h2', null, 'Conquistas'), h('p', { class: 'rcd-subtitulo' }, 'Uma badge para cada objetivo atingido: bronze na semana, prata no mês e ouro no ano.')), conquistas.length > 0 ? h('span', { class: 'rcd-contagem' }, `${conquistas.length} ${conquistas.length === 1 ? 'badge' : 'badges'}`) : null),
        prateleiraDeConquistas(conquistas),
        h('a', { class: 'link-acao rcd-link-objetivos', href: '#/progressao/objetivos' }, 'Ver os meus objetivos', icone('seta', 16)),
      ),
    );
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'rcd-pagina' },
      paginaTopo({ icone: 'esporte', titulo: 'Recordes', subtitulo: 'Suas melhores marcas e as conquistas dos seus objetivos, num lugar só.' }),
      mensagem.el,
      filtros,
      destaques,
      ancoras,
      recordes,
      secaoConquistas,
    ),
  );
  desenharTudo();

  cancelar.push(
    observarAtividades(
      sessao.uid,
      (lista) => {
        atividades = lista;
        carregou.atividades = true;
        desenharTudo();
      },
      () => mensagem.mostrar('Não foi possível carregar as atividades.'),
    ),
    observarEstresseDiario(
      sessao.uid,
      (dias) => {
        serieForma = dias.length > 0 ? montarSerie(dias, hoje) : [];
        desenharRecordes();
        desenharAncoras();
      },
      () => {},
    ),
    observarConquistas(
      sessao.uid,
      (lista) => {
        conquistas = lista;
        carregou.conquistas = true;
        desenharRecordes();
        desenharConquistas();
        desenharAncoras();
        // quem está vendo a tela já viu as badges novas: o selo "Nova" some depois de alguns segundos
        const novas = lista.filter((c) => c.vista === false && !avisadas.has(c.id)).map((c) => c.id);
        if (novas.length > 0) {
          novas.forEach((id) => avisadas.add(id));
          clearTimeout(temporizador);
          temporizador = setTimeout(() => marcarConquistasComoVistas({ ids: novas }).catch(() => {}), 4000);
        }
      },
      () => mensagem.mostrar('Não foi possível carregar as conquistas.'),
    ),
  );

  return () => {
    clearTimeout(temporizador);
    observador?.disconnect();
    cancelar.forEach((fn) => fn());
  };
}
