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
import { confirmar } from '../../utils/modal.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { abrirSugestaoDeTreinoDoDia } from './sugestaoTreinoDia.js';
import { contarPendencias, criarCartaoAcompanhamento } from './acompanhamento.js';
import { desenharCalendario } from './calendario.js';
import { criarEditor } from './editor.js';
import { criarPainelEnviarGarmin } from './enviarGarmin.js';
import { criarCartaoMeta } from './meta.js';
import { criarCartaoMetaCondicionamento } from './metaCondicionamento.js';
import { criarCartaoPlanoAnual } from './planoAnual.js';
import { criarCartaoProvas } from './provas.js';
import { criarCartaoSugestaoIa } from './sugestaoIa.js';
import { criarTreinoDoDia } from '../inicio/treinoDoDia.js';
import { criarCartaoProjecao } from './projecao.js';
import { estadoPlano } from './state.js';

/** Rótulo do período mostrado: "2 a 8 de novembro" (semana) ou "novembro de 2026" (mês). */
function rotuloDoPeriodo(visao, ancora) {
  if (visao === 'mes') return rotuloDoMes(ancora);
  const inicio = inicioDaSemana(ancora);
  return `${formatarData(inicio)} a ${formatarData(somarDias(inicio, 6))}`;
}

const ABAS = [
  { id: 'projecao', rotulo: 'Projeção' },
  { id: 'calendario', rotulo: 'Calendário' },
  { id: 'provas', rotulo: 'Provas' },
  { id: 'acompanhamento', rotulo: 'Acompanhamento' },
];

export function render(raiz, sessao, params = {}) {
  let aba = ABAS.some((a) => a.id === params.aba) ? params.aba : 'calendario';
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
  const abas = h('div', { class: 'treinos-abas', role: 'tablist', 'aria-label': 'Seções do plano' });
  const paineis = Object.fromEntries(ABAS.map((a) => [a.id, h('div', { class: 'pilha plano-painel', id: `plano-painel-${a.id}`, role: 'tabpanel', 'aria-labelledby': `plano-aba-${a.id}` })]));

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
            onClick: () => {
              irParaAba('provas');
              cartaoProvas.abrirNova();
            },
          },
          'Nova prova',
        ),
        temRecurso(obterSessao().perfil, RECURSOS.GARMIN)
          ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: alternarExportacao }, 'Enviar para o Garmin')
          : null,
        h('button', { class: 'btn', type: 'button', onClick: () => abrirEditor(null, hoje) }, 'Novo treino'),
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
      }),
    );
  }

  /** Semanas do plano anual da prova do plano (vazio quando não há prova ou o plano não pôde ser montado). */
  function semanasDoPlanoAnual() {
    try {
      const prova = provaDoPlano(dados.provas, hoje);
      return prova ? montarPlanoAnual({ hoje, prova, dias: dados.dias }).semanas : [];
    } catch {
      return [];
    }
  }

  // ---- abas: a aba aberta fica na URL (#/plano, #/plano/projecao, …) sem recarregar a tela ----
  function irParaAba(id) {
    if (id === aba) return;
    aba = id;
    window.history.pushState(null, '', id === 'calendario' ? '#/plano' : `#/plano/${id}`);
    desenhar();
  }

  function desenharAbas(pronto) {
    const pendencias = pronto ? contarPendencias({ treinos: dados.treinos, atividades: dados.atividades, hoje }) : 0;
    abas.replaceChildren(
      ...ABAS.map((a) =>
        h(
          'button',
          { class: 'treinos-aba', type: 'button', role: 'tab', id: `plano-aba-${a.id}`, 'aria-selected': String(aba === a.id), 'aria-controls': `plano-painel-${a.id}`, onClick: () => irParaAba(a.id) },
          a.rotulo,
          a.id === 'acompanhamento' && pendencias > 0 ? h('span', { class: 'aba-contagem', title: `${pendencias} pendentes` }, String(pendencias)) : null,
        ),
      ),
    );
    for (const a of ABAS) paineis[a.id].hidden = aba !== a.id;
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

    desenharAbas(pronto);
    // só a aba aberta é desenhada; as outras são refeitas quando abertas
    if (aba === 'calendario') desenharAbaCalendario(pronto);
    else if (!pronto) paineis[aba].replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
    else if (aba === 'projecao') desenharAbaProjecao();
    else if (aba === 'provas') desenharAbaProvas();
    else desenharAbaAcompanhamento();
  }

  function desenharAbaCalendario(pronto) {
    desenharBarra();
    const semanasAnual = pronto ? semanasDoPlanoAnual() : [];
    const metaDaSemana = (inicio) => {
      const fim = somarDias(inicio, 6);
      const s = semanasAnual.find((x) => x.inicio <= fim && x.fim >= inicio);
      if (!s) return null;
      const extras = [s.recuperacao ? 'recuperação' : null, s.semanaDaProva ? 'semana da prova' : null].filter(Boolean);
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
              abrirSugestaoDeTreinoDoDia({ uid: sessao.uid, data, configs: dados.configs, aoAceitar: (texto) => mensagem.mostrar(texto, 'ok') });
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

  function desenharAbaProjecao() {
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
    paineis.projecao.replaceChildren(
      criarCartaoProjecao({
        serie,
        hoje,
        meta: metaAtiva,
        avaliacao,
        metaCondicionamento: metaCondAtiva,
        avaliacaoCondicionamento,
        treinoDoDia,
        // clicar num dia com atividade abre a atividade (modal para escolher, se houver mais de uma); nos demais, o treino planejado
        // dele ou um novo treino naquela data (o editor fica na aba Calendário)
        aoClicarDia: (data) => {
          if (abrirAtividadeDoDia(data, dados.atividades)) return;
          irParaAba('calendario');
          abrirEditor(dados.treinos.find((t) => t.data === data && t.status === 'planejado') ?? null, data);
        },
      }),
      criarCartaoMetaCondicionamento({ uid: sessao.uid, hoje, metaAtiva: metaCondAtiva, metasAnteriores: anterioresCond, avaliacao: avaliacaoCondicionamento, condicionamentoAtual }),
      criarCartaoMeta({ uid: sessao.uid, hoje, metaAtiva, metasAnteriores: anteriores, avaliacao }),
    );
  }

  function desenharAbaProvas() {
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
    paineis.provas.replaceChildren(cartaoProvas.el, cartaoPlanoAnual.el);
  }

  function desenharAbaAcompanhamento() {
    paineis.acompanhamento.replaceChildren(
      criarCartaoAcompanhamento({
        treinos: dados.treinos,
        atividades: dados.atividades,
        configs: dados.configs,
        calibracao: dados.calibracao,
        hoje,
        aoVincular: (treinoId, atividadeId) => executar(() => vincularTreino(treinoId, atividadeId), 'Treino vinculado à atividade.'),
        aoPular: (treinoId) => executar(() => pularTreino(treinoId), 'Treino marcado como pulado.'),
        aoReagendar: (treinoId, data) => executar(() => moverTreino(treinoId, data), 'Treino reagendado para hoje.'),
        aoIgnorar: desenhar,
      }),
    );
  }

  // A IA só aparece para quem o administrador liberou (o servidor confere de novo em cada pedido).
  const cartaoIa = temRecurso(obterSessao().perfil, RECURSOS.IA) ? criarCartaoSugestaoIa({ uid: sessao.uid, obterConfigs: () => dados.configs }) : null;

  // O calendário, o editor e a IA ficam sempre montados na aba Calendário (o editor e a exportação guardam o que foi digitado).
  paineis.calendario.replaceChildren(
    ...[
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Calendário de treinos'),
        h('p', { class: 'texto-secundario' }, 'Arraste um treino para outro dia. Treinos planejados em dias passados e não feitos não entram na projeção.'),
        barra,
        exportacaoArea,
        calendario,
      ),
      editorArea,
      cartaoIa,
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
        h('p', { class: 'texto-secundario' }, 'Planeje os treinos, veja a projeção da Forma, acompanhe as provas e metas e confira o que foi feito.'),
        aviso,
        abas,
        mensagem.el,
      ),
      ...ABAS.map((a) => paineis[a.id]),
    ),
  );
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
    cancelar.forEach((fn) => fn());
  };
}
