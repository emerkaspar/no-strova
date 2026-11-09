import { FASES, inicioDaSemana, primeiroDoMes, provaDoPlano, RECURSOS, rotuloDoMes, somarDias, somarMeses, temRecurso, treinosFuturos } from '@no-strova/domain';
import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { obterSessao } from '../../application/sessao.js';
import { modelosProprios } from '../../application/modelos.js';
import { montarPlanoAnual } from '../../application/provas.js';
import { agruparPorDia, dataInicialDoHistorico, montarProjecao } from '../../application/plano.js';
import { observarAtividadesDesde } from '../../infrastructure/atividadesRepo.js';
import { abrirAtividadeDoDia } from '../atividades/abrirDoDia.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarModelos } from '../../infrastructure/modelosRepo.js';
import { excluirTreino, excluirTreinosEmLote, moverTreino, observarMetas, observarMetasCondicionamento, observarTreinos, pularTreino, vincularTreino } from '../../infrastructure/planoRepo.js';
import { observarProvas } from '../../infrastructure/provasRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { salvarPassoGarmin } from '../../application/onboarding.js';
import { intervalsSituacao } from '../../core/functions.js';
import { confirmar } from '../../utils/modal.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { abrirSugestaoDeTreinoDoDia } from './sugestaoTreinoDia.js';
import { criarFaixaPendencias } from './acompanhamento.js';
import { desenharCalendario } from './calendario.js';
import { criarEditor } from './editor.js';
import { criarPainelEnviarGarmin } from './enviarGarmin.js';
import { criarCartaoMeta } from './meta.js';
import { criarCartaoMetaCondicionamento } from './metaCondicionamento.js';
import { criarCartaoPlanoAnual } from './planoAnual.js';
import { criarCartaoProvas } from './provas.js';
import { criarPainelIa } from './sugestaoIa.js';
import { criarTreinoDoDia } from '../inicio/treinoDoDia.js';
import { criarCartaoProjecao } from './projecao.js';
import { estadoPlano } from './state.js';

/** Rótulo do período mostrado: "2 a 8 de novembro" (semana) ou "novembro de 2026" (mês). */
function rotuloDoPeriodo(visao, ancora) {
  if (visao === 'mes') return rotuloDoMes(ancora);
  const inicio = inicioDaSemana(ancora);
  return `${formatarData(inicio)} a ${formatarData(somarDias(inicio, 6))}`;
}

/** Seções da página, na ordem em que aparecem; a barra de âncoras no topo leva a elas. */
const SECOES = [
  { id: 'calendario', rotulo: 'Calendário' },
  { id: 'projecao', rotulo: 'Projeção' },
  { id: 'provas', rotulo: 'Eventos' },
];
/** Rotas antigas (#/plano/acompanhamento) rolam até a seção que herdou o conteúdo. */
const ALVO_DA_ROTA = Object.freeze({ calendario: 'plano-calendario', projecao: 'plano-projecao', provas: 'plano-provas', acompanhamento: 'plano-pendencias' });

const carregando = () => h('p', { class: 'vazio', role: 'status' }, 'Carregando…');

export function render(raiz, sessao, params = {}) {
  let secaoInicial = ALVO_DA_ROTA[params.secao] ? params.secao : null; // rola até ela quando os dados chegarem
  const hoje = hojeIso();
  const desde = dataInicialDoHistorico(hoje);
  const dados = { dias: [], treinos: [], atividades: [], configs: [], metas: [], metasCondicionamento: [], modelos: [], provas: [], calibracao: null, preferencias: null };
  const carregou = { dias: false, treinos: false, atividades: false, configs: false, metas: false, metasCondicionamento: false, modelos: false, provas: false, calibracao: false };
  let ativa = true;
  const cancelar = [];

  const mensagem = areaMensagem();
  const aviso = h('p', { class: 'mensagem', hidden: true });
  const barra = h('div', { class: 'plano-barra' });
  const calendario = h('div');
  const editorArea = h('div');
  const exportacaoArea = h('div');
  const lembreteGarmin = h('div');
  let garminConectado; // undefined = ainda não sabemos; só é consultado para quem disse que quer usar o Garmin
  const ancoras = h('nav', { class: 'plano-ancoras', 'aria-label': 'Seções do plano' });
  const secPendencias = h('div');
  const secCalendario = h('div', { class: 'pilha plano-secao', id: 'plano-calendario' });
  const secProjecao = h('div', { class: 'pilha plano-secao', id: 'plano-projecao' });
  const secProvas = h('div', { class: 'pilha plano-secao', id: 'plano-provas' });
  const secaoPorId = { calendario: secCalendario, projecao: secProjecao, provas: secProvas };
  let secaoVisivel = 'calendario';
  let observador = null;

  const ancora = () => estadoPlano.ancora ?? hoje;
  const treinoDoDia = criarTreinoDoDia(dados, hoje);
  // criados uma vez: guardam o formulário, a prova escolhida e o rascunho aberto quando chegam dados novos
  const cartaoProvas = criarCartaoProvas({ uid: sessao.uid, hoje });
  const cartaoPlanoAnual = criarCartaoPlanoAnual({ uid: sessao.uid, hoje });

  // ---- edição ----
  function fecharEditor(texto) {
    editorArea.replaceChildren();
    if (texto) mensagem.mostrar(texto, 'ok');
  }

  function abrirEditor(treino, data) {
    mensagem.limpar();
    editorArea.replaceChildren(
      criarEditor({
        uid: sessao.uid,
        configs: () => dados.configs,
        calibracao: () => dados.calibracao,
        modelos: () => modelosProprios(dados.modelos),
        treino,
        dataInicial: data,
        aoConcluir: fecharEditor,
        aoCancelar: () => fecharEditor(),
      }),
    );
    editorArea.firstChild.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  async function executar(acao, avisoOk) {
    mensagem.limpar();
    try {
      await acao();
      if (avisoOk) mensagem.mostrar(avisoOk, 'ok');
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível concluir a operação.');
      throw err;
    }
  }

  // ---- exclusão ----
  const descricaoDoTreino = (t) => `${t.nomeTreino || `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} de ${t.duracaoMin} min`} em ${formatarData(t.data)}`;

  /** Treino arrastado até a lixeira: confirma e exclui. */
  async function excluirArrastado(id) {
    const t = dados.treinos.find((x) => x.id === id);
    if (!t) return;
    const ok = await confirmar({
      titulo: 'Excluir este treino?',
      mensagem: `${descricaoDoTreino(t)} sai do plano e da projeção.`,
      confirmarTexto: 'Excluir',
      tipo: 'perigo',
      icone: 'lixeira',
    });
    if (ok) executar(() => excluirTreino(id), 'Treino excluído.').catch(() => {});
  }

  /** "Excluir todos os treinos futuros": dois modais seguidos, para ninguém apagar o plano sem querer. */
  async function excluirTodosOsFuturos() {
    const n = treinosFuturos(dados.treinos, hoje).length;
    if (n === 0) return;
    const primeiro = await confirmar({
      titulo: 'Excluir todos os treinos futuros?',
      mensagem: `Você tem ${n} ${n === 1 ? 'treino planejado' : 'treinos planejados'} a partir de amanhã.

Se preferir, dá para excluir um a um: arraste o treino até a lixeira do calendário ou abra o treino e clique em Excluir.

Quer apagar todos de uma vez mesmo assim?`,
      confirmarTexto: 'Continuar',
      tipo: 'aviso',
      icone: 'lixeira',
    });
    if (!primeiro) return;
    // o plano pode ter mudado enquanto o primeiro modal estava aberto
    const futuros = treinosFuturos(dados.treinos, hoje);
    if (futuros.length === 0) return;
    const m = futuros.length;
    const segundo = await confirmar({
      titulo: 'Última confirmação',
      mensagem: `${m === 1 ? '1 treino será apagado' : `${m} treinos serão apagados`} do plano e da projeção. Isso não pode ser desfeito.

Os treinos já realizados e o de hoje não são afetados.`,
      confirmarTexto: m === 1 ? 'Excluir 1 treino' : `Excluir ${m} treinos`,
      cancelarTexto: 'Voltar',
      tipo: 'perigo',
      icone: 'lixeira',
    });
    if (!segundo) return;
    executar(() => excluirTreinosEmLote(futuros.map((t) => t.id)), m === 1 ? 'Treino excluído.' : `${m} treinos excluídos.`).catch(() => {});
  }

  // ---- navegação do calendário ----
  function navegar(passo) {
    const a = ancora();
    estadoPlano.ancora = estadoPlano.visao === 'mes' ? somarMeses(a, passo) : somarDias(a, passo * 7);
    if (estadoPlano.visao === 'mes') estadoPlano.ancora = primeiroDoMes(estadoPlano.ancora);
    desenhar();
  }

  function desenharBarra() {
    const botaoVisao = (id, rotulo) =>
      h(
        'button',
        {
          class: 'btn btn-secundario',
          type: 'button',
          'aria-pressed': String(estadoPlano.visao === id),
          onClick: () => {
            estadoPlano.visao = id;
            desenhar();
          },
        },
        rotulo,
      );
    barra.replaceChildren(
      h('div', { class: 'linha-botoes', role: 'group', 'aria-label': 'Visão do calendário' }, botaoVisao('semana', 'Semana'), botaoVisao('mes', 'Mês')),
      h(
        'div',
        { class: 'plano-navegacao' },
        h('button', { class: 'btn btn-secundario', type: 'button', 'aria-label': 'Período anterior', onClick: () => navegar(-1) }, '‹'),
        h('strong', { class: 'plano-periodo', 'aria-live': 'polite' }, rotuloDoPeriodo(estadoPlano.visao, ancora())),
        h('button', { class: 'btn btn-secundario', type: 'button', 'aria-label': 'Próximo período', onClick: () => navegar(1) }, '›'),
        h(
          'button',
          {
            class: 'btn btn-secundario',
            type: 'button',
            onClick: () => {
              estadoPlano.ancora = null;
              desenhar();
            },
          },
          'Hoje',
        ),
      ),
      h(
        'div',
        { class: 'linha-botoes' },
        h(
          'button',
          {
            class: 'btn btn-secundario',
            type: 'button',
            onClick: () => cartaoProvas.abrirNova(), // o formulário fica na seção Provas e a rola até o campo
          },
          'Novo evento',
        ),
        temRecurso(obterSessao().perfil, RECURSOS.GARMIN)
          ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: alternarExportacao }, 'Enviar para o Garmin')
          : null,
        h('button', { class: 'btn', type: 'button', onClick: () => abrirEditor(null, hoje) }, 'Novo treino'),
      ),
    );
  }

  // ---- lembrete do Garmin: só para quem disse "uso" ou "decido depois" no perfil e ainda não conectou o intervals.icu ----
  let consultandoGarmin = false;
  function desenharLembreteGarmin() {
    const uso = dados.preferencias?.usoGarmin;
    const querUsar = temRecurso(obterSessao().perfil, RECURSOS.GARMIN) && (uso === 'sim' || uso === 'depois');
    if (!querUsar || garminConectado === true) {
      lembreteGarmin.replaceChildren();
      return;
    }
    if (garminConectado === undefined) {
      if (!consultandoGarmin) {
        consultandoGarmin = true;
        intervalsSituacao()
          .then((s) => (garminConectado = Boolean(s.conectado)))
          .catch(() => (garminConectado = true)) // sem como saber: não incomoda
          .finally(() => {
            consultandoGarmin = false;
            if (ativa) desenharLembreteGarmin();
          });
      }
      lembreteGarmin.replaceChildren();
      return;
    }
    lembreteGarmin.replaceChildren(
      h(
        'div',
        { class: 'lembrete-garmin' },
        icone('garmin', 16),
        h('span', null, uso === 'sim' ? 'Você quer enviar treinos ao Garmin, mas o intervals.icu ainda não está conectado.' : 'Você deixou o Garmin para decidir depois: dá para enviar os treinos do plano ao relógio.'),
        h(
          'button',
          {
            class: 'btn-link',
            type: 'button',
            onClick: () => {
              if (!exportacaoArea.hasChildNodes()) alternarExportacao();
              exportacaoArea.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            },
          },
          'Configurar agora',
        ),
        h(
          'button',
          { class: 'btn-link', type: 'button', onClick: () => executar(() => salvarPassoGarmin({ uid: sessao.uid, uso: 'nao' })).catch(() => {}) },
          'Não uso',
        ),
      ),
    );
  }

  // ---- exportação para o Garmin ----
  function alternarExportacao() {
    if (exportacaoArea.hasChildNodes()) {
      exportacaoArea.replaceChildren();
      return;
    }
    exportacaoArea.replaceChildren(
      criarPainelEnviarGarmin({
        hoje,
        obterAncora: ancora,
        aoFechar: () => exportacaoArea.replaceChildren(),
        aoConectar: () => {
          garminConectado = true;
          desenharLembreteGarmin();
        },
      }),
    );
  }

  /** Semanas do plano anual da prova do plano (vazio quando não há prova ou o plano não pôde ser montado). */
  function semanasDoPlanoAnual() {
    try {
      const prova = provaDoPlano(dados.provas, hoje);
      return prova ? montarPlanoAnual({ hoje, prova, dias: dados.dias, preferencias: dados.preferencias }).semanas : [];
    } catch {
      return [];
    }
  }

  // ---- âncoras: a barra fixa leva às seções e destaca a que está na tela; a URL acompanha, sem recarregar ----
  function rolarPara(id, comportamento = 'smooth') {
    const alvo = document.getElementById(ALVO_DA_ROTA[id]) ?? secaoPorId[id];
    alvo?.scrollIntoView?.({ behavior: comportamento, block: 'start' });
  }

  function irParaSecao(id) {
    window.history.replaceState(null, '', id === 'calendario' ? '#/plano' : `#/plano/${id}`);
    rolarPara(id);
  }

  function desenharAncoras() {
    ancoras.replaceChildren(
      ...SECOES.map((s) =>
        h('button', { class: 'plano-ancora', type: 'button', 'aria-current': secaoVisivel === s.id ? 'true' : null, onClick: () => irParaSecao(s.id) }, s.rotulo),
      ),
    );
  }

  /** Destaca na barra a seção que ocupa a parte de cima da tela. */
  function observarSecoes() {
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Set();
    observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.dataset.secao);
          else visiveis.delete(e.target.dataset.secao);
        }
        const atual = SECOES.find((s) => visiveis.has(s.id))?.id;
        if (atual && atual !== secaoVisivel) {
          secaoVisivel = atual;
          desenharAncoras();
        }
      },
      // só conta a faixa de cima da tela (abaixo da barra fixa)
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const s of SECOES) {
      secaoPorId[s.id].dataset.secao = s.id;
      observador.observe(secaoPorId[s.id]);
    }
  }

  // ---- desenho ----
  function desenhar() {
    if (!ativa) return;
    const pronto = Object.values(carregou).every(Boolean);

    aviso.hidden = dados.configs.length > 0 || !carregou.configs;
    if (!aviso.hidden) {
      aviso.className = 'mensagem';
      aviso.replaceChildren('Cadastre a sua configuração de FC para o app estimar o estresse dos treinos. ', h('a', { href: '#/configuracao' }, 'Ir para Configuração'));
    }

    desenharPendencias(pronto);
    desenharSecaoCalendario(pronto);
    desenharSecaoProjecao(pronto);
    desenharSecaoProvas(pronto);
    painelIa?.atualizar();
    desenharLembreteGarmin();

    // rota antiga (#/plano/provas, /acompanhamento…): só rola quando os dados chegaram, para a página já ter a altura final
    if (pronto && secaoInicial) {
      const id = secaoInicial;
      secaoInicial = null;
      requestAnimationFrame(() => rolarPara(id, 'auto'));
    }
  }

  /** Faixa fina no topo: só existe quando há treino para vincular ou atrasado. */
  function desenharPendencias(pronto) {
    const faixa = pronto
      ? criarFaixaPendencias({
          treinos: dados.treinos,
          atividades: dados.atividades,
          hoje,
          aoVincular: (treinoId, atividadeId) => executar(() => vincularTreino(treinoId, atividadeId), 'Treino vinculado à atividade.'),
          aoPular: (treinoId) => executar(() => pularTreino(treinoId), 'Treino marcado como pulado.'),
          aoReagendar: (treinoId, data) => executar(() => moverTreino(treinoId, data), 'Treino reagendado para hoje.'),
          aoIgnorar: desenhar,
        })
      : null;
    secPendencias.replaceChildren(...(faixa ? [faixa] : []));
  }

  function desenharSecaoCalendario(pronto) {
    desenharBarra();
    const semanasAnual = pronto ? semanasDoPlanoAnual() : [];
    const metaDaSemana = (inicio) => {
      const fim = somarDias(inicio, 6);
      const s = semanasAnual.find((x) => x.inicio <= fim && x.fim >= inicio);
      if (!s) return null;
      const extras = [s.recuperacao ? 'recuperação' : null, s.semanaDaProva ? 'semana do evento' : null].filter(Boolean);
      return { cargaAlvo: s.cargaAlvo, fase: FASES[s.fase]?.rotulo ?? s.fase, detalhe: extras.join(' · ') };
    };
    const futurosN = pronto ? treinosFuturos(dados.treinos, hoje).length : 0;
    calendario.replaceChildren(
      ...[
      pronto
        ? desenharCalendario({
            visao: estadoPlano.visao,
            ancora: ancora(),
            hoje,
            configs: dados.configs,
            calibracao: dados.calibracao,
            porDia: agruparPorDia(dados.treinos, dados.atividades),
            metaDaSemana,
            aoEditar: (t) => abrirEditor(t, t.data),
            comIa: temRecurso(obterSessao().perfil, RECURSOS.IA),
            aoNovo: (data, modo) => {
              if (modo !== 'ia') return abrirEditor(null, data);
              mensagem.limpar();
              abrirSugestaoDeTreinoDoDia({ uid: sessao.uid, data, configs: dados.configs, modelos: modelosProprios(dados.modelos), aoAceitar: (texto) => mensagem.mostrar(texto, 'ok') });
            },
            aoMover: (id, data) => {
              const t = dados.treinos.find((x) => x.id === id);
              if (!t || t.data === data) return;
              executar(() => moverTreino(id, data), `Treino movido para ${formatarData(data)}.`).catch(() => {});
            },
            aoExcluir: excluirArrastado,
          })
        : h('p', { class: 'vazio', role: 'status' }, 'Carregando…'),
      // no mês, o botão que apaga todo o plano futuro (com duas confirmações)
      pronto && estadoPlano.visao === 'mes'
        ? h(
            'div',
            { class: 'cal-rodape' },
            h('span', { class: 'texto-secundario' }, futurosN > 0 ? `${futurosN} ${futurosN === 1 ? 'treino planejado' : 'treinos planejados'} a partir de amanhã` : 'Nenhum treino planejado a partir de amanhã'),
            h('button', { class: 'btn btn-perigo', type: 'button', disabled: futurosN === 0, onClick: excluirTodosOsFuturos }, icone('lixeira', 16), 'Excluir todos os treinos futuros'),
          )
        : null,
      ].filter(Boolean),
    );
  }

  function desenharSecaoProjecao(pronto) {
    if (!pronto) {
      secProjecao.replaceChildren(carregando());
      return;
    }
    const metasAtivas = dados.metas.filter((m) => m.ativa);
    const metaAtiva = metasAtivas.sort((a, b) => (a.dataAlvo < b.dataAlvo ? -1 : 1))[0] ?? null;
    const anteriores = dados.metas.filter((m) => !m.ativa).sort((a, b) => (a.dataAlvo < b.dataAlvo ? 1 : -1)).slice(0, 5);
    const ativaMaisProxima = (lista) => lista.filter((m) => m.ativa).sort((a, b) => (a.dataAlvo < b.dataAlvo ? -1 : 1))[0] ?? null;
    const metaCondAtiva = ativaMaisProxima(dados.metasCondicionamento);
    const anterioresCond = dados.metasCondicionamento.filter((m) => !m.ativa).sort((a, b) => (a.dataAlvo < b.dataAlvo ? 1 : -1)).slice(0, 5);
    const { serie, avaliacao, avaliacaoCondicionamento } = montarProjecao({
      dias: dados.dias,
      treinos: dados.treinos,
      configs: dados.configs,
      meta: metaAtiva,
      metaCondicionamento: metaCondAtiva,
      hoje,
      calibracao: dados.calibracao,
    });
    const condicionamentoAtual = serie.find((d) => d.data === hoje)?.fitness ?? null;
    secProjecao.replaceChildren(
      criarCartaoProjecao({
        serie,
        hoje,
        meta: metaAtiva,
        avaliacao,
        metaCondicionamento: metaCondAtiva,
        avaliacaoCondicionamento,
        treinoDoDia,
        // clicar num dia com atividade abre a atividade (modal para escolher, se houver mais de uma); nos demais, o treino planejado
        // dele ou um novo treino naquela data (o editor fica na seção do Calendário e a tela rola até ele)
        aoClicarDia: (data) => {
          if (abrirAtividadeDoDia(data, dados.atividades)) return;
          abrirEditor(dados.treinos.find((t) => t.data === data && t.status === 'planejado') ?? null, data);
        },
      }),
      // as duas metas num único bloco, em largura total, logo abaixo do gráfico (uma por linha, separadas por um filete)
      h(
        'section',
        { class: 'card plano-metas', 'aria-label': 'Metas' },
        h('h2', { class: 'plano-metas-titulo' }, 'Metas'),
        criarCartaoMetaCondicionamento({ uid: sessao.uid, hoje, metaAtiva: metaCondAtiva, metasAnteriores: anterioresCond, avaliacao: avaliacaoCondicionamento, condicionamentoAtual }),
        criarCartaoMeta({ uid: sessao.uid, hoje, metaAtiva, metasAnteriores: anteriores, avaliacao }),
      ),
    );
  }

  function desenharSecaoProvas(pronto) {
    if (!pronto) {
      secProvas.replaceChildren(carregando());
      return;
    }
    cartaoProvas.atualizar(dados.provas);
    cartaoPlanoAnual.atualizar({
      provas: dados.provas,
      dias: dados.dias,
      treinos: dados.treinos,
      configs: dados.configs,
      calibracao: dados.calibracao,
      modelos: modelosProprios(dados.modelos),
      preferencias: dados.preferencias,
      metasForma: dados.metas,
    });
    secProvas.replaceChildren(cartaoProvas.el, cartaoPlanoAnual.el);
  }

  // A IA só aparece para quem o administrador liberou (o servidor confere de novo em cada pedido).
  const comIa = temRecurso(obterSessao().perfil, RECURSOS.IA);
  const painelIa = comIa ? criarPainelIa({ uid: sessao.uid, hoje, obterContexto: () => ({ configs: dados.configs, calibracao: dados.calibracao, provas: dados.provas, modelos: modelosProprios(dados.modelos) }) }) : null;
  const botaoIa = comIa
    ? h('button', { class: 'btn btn-secundario', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'plano-ia' }, icone('esporte', 16), 'Sugerir com IA')
    : null;
  botaoIa?.addEventListener('click', () => {
    painelIa.el.hidden = !painelIa.el.hidden;
    botaoIa.setAttribute('aria-expanded', String(!painelIa.el.hidden));
    if (!painelIa.el.hidden) painelIa.el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });

  // O calendário, o editor e o painel de IA ficam sempre montados (o editor e a exportação guardam o que foi digitado).
  secCalendario.replaceChildren(
    ...[
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'prog-secao-topo' }, h('h2', null, 'Calendário de treinos'), botaoIa),
        h('p', { class: 'texto-secundario' }, 'Arraste um treino para outro dia. Treinos planejados em dias passados e não feitos não entram na projeção.'),
        mensagem.el,
        barra,
        lembreteGarmin,
        exportacaoArea,
        painelIa?.el,
        calendario,
      ),
      editorArea,
    ].filter(Boolean),
  );

  raiz.replaceChildren(
    h(
      'div',
      { class: 'pilha' },
      h(
        'section',
        { class: 'card' },
        h('h1', null, 'Plano de treino'),
        h('p', { class: 'texto-secundario' }, 'Planeje os treinos, veja a projeção da Forma, acompanhe os eventos e as metas e confira o que foi feito.'),
        aviso,
      ),
      ancoras,
      secPendencias,
      secCalendario,
      secProjecao,
      secProvas,
    ),
  );
  desenharAncoras();
  observarSecoes();
  desenhar();
  if (estadoPlano.novoTreinoEm) {
    const data = estadoPlano.novoTreinoEm;
    estadoPlano.novoTreinoEm = null;
    estadoPlano.ancora = data;
    desenhar();
    abrirEditor(null, data);
  }

  const aoErro = (err) => {
    console.error('Plano: falha ao carregar os dados', err);
    mensagem.mostrar('Não foi possível carregar os dados do plano.');
  };
  const ouvir = (chave, assinar) =>
    assinar((lista) => {
      dados[chave] = lista;
      carregou[chave] = true;
      desenhar();
    });
  cancelar.push(
    ouvir('dias', (cb) => observarEstresseDiario(sessao.uid, cb, aoErro)),
    ouvir('treinos', (cb) => observarTreinos(sessao.uid, desde, cb, aoErro)),
    ouvir('atividades', (cb) => observarAtividadesDesde(sessao.uid, desde, cb, aoErro)),
    ouvir('configs', (cb) => observarConfigs(sessao.uid, cb, aoErro)),
    ouvir('metas', (cb) => observarMetas(sessao.uid, cb, aoErro)),
    ouvir('metasCondicionamento', (cb) => observarMetasCondicionamento(sessao.uid, cb, aoErro)),
    ouvir('modelos', (cb) => observarModelos(sessao.uid, cb, aoErro)),
    ouvir('provas', (cb) => observarProvas(sessao.uid, hoje, cb, aoErro)),
    observarCalibracaoDoUsuario(sessao.uid, ({ efetiva, preferencias }) => {
      dados.calibracao = efetiva;
      dados.preferencias = preferencias;
      carregou.calibracao = true;
      desenhar();
    }),
  );

  return () => {
    ativa = false;
    observador?.disconnect();
    cancelar.forEach((fn) => fn());
  };
}
