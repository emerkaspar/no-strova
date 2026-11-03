import { inicioDaSemana, primeiroDoMes, rotuloDoMes, somarDias, somarMeses } from '@no-strova/domain';
import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { modelosProprios } from '../../application/modelos.js';
import { agruparPorDia, dataInicialDoHistorico, montarProjecao } from '../../application/plano.js';
import { observarAtividadesDesde } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarModelos } from '../../infrastructure/modelosRepo.js';
import { moverTreino, observarMetas, observarMetasCondicionamento, observarTreinos, pularTreino, vincularTreino } from '../../infrastructure/planoRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, hojeIso } from '../../utils/formatters.js';
import { criarCartaoAcompanhamento } from './acompanhamento.js';
import { desenharCalendario } from './calendario.js';
import { criarEditor } from './editor.js';
import { criarCartaoMeta } from './meta.js';
import { criarCartaoMetaCondicionamento } from './metaCondicionamento.js';
import { criarTreinoDoDia } from '../inicio/treinoDoDia.js';
import { criarCartaoProjecao } from './projecao.js';
import { estadoPlano } from './state.js';

/** Rótulo do período mostrado: "2 a 8 de novembro" (semana) ou "novembro de 2026" (mês). */
function rotuloDoPeriodo(visao, ancora) {
  if (visao === 'mes') return rotuloDoMes(ancora);
  const inicio = inicioDaSemana(ancora);
  return `${formatarData(inicio)} a ${formatarData(somarDias(inicio, 6))}`;
}

export function render(raiz, sessao) {
  const hoje = hojeIso();
  const desde = dataInicialDoHistorico(hoje);
  const dados = { dias: [], treinos: [], atividades: [], configs: [], metas: [], metasCondicionamento: [], modelos: [], calibracao: null };
  const carregou = { dias: false, treinos: false, atividades: false, configs: false, metas: false, metasCondicionamento: false, modelos: false, calibracao: false };
  let ativa = true;
  const cancelar = [];

  const mensagem = areaMensagem();
  const aviso = h('p', { class: 'mensagem', hidden: true });
  const barra = h('div', { class: 'plano-barra' });
  const calendario = h('div');
  const editorArea = h('div');
  const resto = h('div', { class: 'pilha' });

  const ancora = () => estadoPlano.ancora ?? hoje;
  const treinoDoDia = criarTreinoDoDia(dados, hoje);

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
      h('button', { class: 'btn', type: 'button', onClick: () => abrirEditor(null, hoje) }, 'Novo treino'),
    );
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

    desenharBarra();
    calendario.replaceChildren(
      pronto
        ? desenharCalendario({
            visao: estadoPlano.visao,
            ancora: ancora(),
            hoje,
            configs: dados.configs,
            calibracao: dados.calibracao,
            porDia: agruparPorDia(dados.treinos, dados.atividades),
            aoEditar: (t) => abrirEditor(t, t.data),
            aoNovo: (data) => abrirEditor(null, data),
            aoMover: (id, data) => {
              const t = dados.treinos.find((x) => x.id === id);
              if (!t || t.data === data) return;
              executar(() => moverTreino(id, data), `Treino movido para ${formatarData(data)}.`).catch(() => {});
            },
          })
        : h('p', { class: 'vazio', role: 'status' }, 'Carregando…'),
    );

    if (!pronto) return;
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

    resto.replaceChildren(
      criarCartaoProjecao({
        serie,
        hoje,
        meta: metaAtiva,
        avaliacao,
        metaCondicionamento: metaCondAtiva,
        avaliacaoCondicionamento,
        treinoDoDia,
        // clicar num dia abre o treino planejado dele ou um novo treino naquela data
        aoClicarDia: (data) => abrirEditor(dados.treinos.find((t) => t.data === data && t.status === 'planejado') ?? null, data),
      }),
      criarCartaoMetaCondicionamento({ uid: sessao.uid, hoje, metaAtiva: metaCondAtiva, metasAnteriores: anterioresCond, avaliacao: avaliacaoCondicionamento, condicionamentoAtual }),
      criarCartaoMeta({ uid: sessao.uid, hoje, metaAtiva, metasAnteriores: anteriores, avaliacao }),
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

  raiz.replaceChildren(
    h(
      'div',
      { class: 'pilha' },
      h('section', { class: 'card' }, h('h1', null, 'Plano de treino'), h('p', { class: 'texto-secundario' }, 'Planeje os treinos, arraste para outro dia e veja a projeção da Forma. Treinos planejados em dias passados e não feitos não entram na projeção.'), aviso, barra, mensagem.el, calendario),
      editorArea,
      resto,
    ),
  );
  desenhar();

  const aoErro = () => mensagem.mostrar('Não foi possível carregar os dados do plano.');
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
    observarCalibracaoDoUsuario(sessao.uid, ({ efetiva }) => {
      dados.calibracao = efetiva;
      carregou.calibracao = true;
      desenhar();
    }),
  );

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
