import { comparativoSemanal, estresseDoTreino, inicioDaSemana, montarSemana, proximoTreinoPlanejado, sequenciaSemanal, somarDias } from '@no-strova/domain';
import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { montarSerie, pedirReconstrucaoSeVazio } from '../../application/forma.js';
import { montarProjecao } from '../../application/plano.js';
import { observarAtividadesDesde, observarUltimasAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarMetasCondicionamento, observarTreinos } from '../../infrastructure/planoRepo.js';
import { h } from '../../utils/dom.js';
import { hojeIso } from '../../utils/formatters.js';
import { blocoAtividades, blocoForma, blocoGrafico, blocoMinis, blocoPeso, blocoSemana, blocoSugestao, tituloDoTreino } from './blocos.js';
import { DIAS_DE_PLANO, rotuloDoDia } from './graficoPrincipal.js';
import { criarTreinoDoDia } from './treinoDoDia.js';

/** Dias de histórico de atividades e treinos para nomear o treino de cada dia no gráfico (cobre o período de 10 sem). */
const DIAS_DE_HISTORICO = 70;

/**
 * Início: Forma hoje, semana atual (realizado e planejado), gráfico de Condicionamento, fadiga e forma com a
 * projeção do plano, e uma linha com últimas atividades, peso e sugestão. Cada bloco mostra um estado vazio curto
 * sem dados.
 */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const segunda = inicioDaSemana(hoje);
  const desdeHistorico = somarDias(hoje, -DIAS_DE_HISTORICO);
  const dados = {
    dias: [],
    ultimas: [],
    atividades: [],
    treinos: [],
    configs: [],
    calibracao: null,
    metasCondicionamento: [],
    carregou: { dias: false, ultimas: false, atividades: false, treinos: false, configs: false, calibracao: false, metasCondicionamento: false },
  };
  let ativa = true;

  const topo = h('div', { class: 'inicio-topo' });
  const grafico = h('div');
  const linha = h('div', { class: 'inicio-linha' });
  raiz.replaceChildren(h('div', { class: 'inicio' }, topo, grafico, linha));

  const treinoDoDia = criarTreinoDoDia(dados, hoje);

  const esportesDoDia = (data) => dados.atividades.filter((a) => a.data === data).map((a) => a.esporte);

  /** Próximo treino planejado (de hoje em diante), com o estresse estimado, para o cartão da semana. */
  function proximoDoPlano() {
    const t = proximoTreinoPlanejado(dados.treinos, hoje);
    if (!t) return null;
    return {
      titulo: `${tituloDoTreino([t])} · ${t.duracaoMin} min`,
      quando: t.data === hoje ? 'Hoje' : rotuloDoDia(t.data),
      estresse: estresseDoTreino(t, dados.configs, dados.calibracao),
    };
  }

  function desenhar() {
    if (!ativa) return;
    const c = dados.carregou;
    // O destaque usa só o realizado: a Forma de hoje não depende do plano.
    const serieReal = c.dias ? montarSerie(dados.dias, hoje) : [];
    const planoPronto = c.dias && c.treinos && c.configs && c.calibracao;
    const serieComPlano = planoPronto
      ? montarProjecao({ dias: dados.dias, treinos: dados.treinos, configs: dados.configs, meta: null, hoje, limiteDias: DIAS_DE_PLANO, calibracao: dados.calibracao }).serie
      : [];

    // Treinos ainda por fazer nesta semana (hoje em diante), com o estresse estimado.
    const treinosDaSemana = dados.treinos.filter((t) => t.status === 'planejado' && t.data >= hoje && t.data >= segunda);
    const planejado = treinosDaSemana.map((t) => ({ data: t.data, estresse: estresseDoTreino(t, dados.configs, dados.calibracao) }));

    const comDados = c.dias && dados.dias.length > 0;
    // Meta de Condicionamento: a mais próxima das ativas e a projeção do plano até a data dela (sem o corte de 14 dias do gráfico)
    const metaCond = c.metasCondicionamento ? dados.metasCondicionamento.filter((m) => m.ativa).sort((a, b) => (a.dataAlvo < b.dataAlvo ? -1 : 1))[0] ?? null : null;
    const projecaoDaMeta =
      comDados && planoPronto && metaCond
        ? montarProjecao({ dias: dados.dias, treinos: dados.treinos, configs: dados.configs, meta: null, metaCondicionamento: metaCond, hoje, calibracao: dados.calibracao })
        : null;
    topo.replaceChildren(
      // coluna da esquerda: o destaque e, embaixo, o próximo treino e a sequência
      h(
        'div',
        { class: 'inicio-coluna' },
        blocoForma({ serie: serieReal, carregou: c.dias, semHrss: c.dias && dados.dias.length > 0 && serieReal.length === 0 }),
        comDados
          ? blocoMinis({
              proximo: proximoDoPlano(),
              sequencia: sequenciaSemanal(dados.dias.filter((d) => d.estresse > 0 || d.qtdAtividades > 0).map((d) => d.data), hoje),
              metaCondicionamento: metaCond,
              avaliacaoCondicionamento: projecaoDaMeta?.avaliacaoCondicionamento ?? null,
              condicionamentoAtual: serieReal.length > 0 ? serieReal[serieReal.length - 1].fitness : null,
            })
          : null,
      ),
      blocoSemana({
        semana: montarSemana(hoje, { realizado: dados.dias.filter((d) => d.data >= segunda), planejado }),
        atividades: dados.atividades.filter((a) => a.data >= segunda),
        treinos: treinosDaSemana,
        comparativo: comparativoSemanal(hoje, { atividades: dados.atividades, dias: dados.dias }),
        carregou: c.dias && c.atividades && c.treinos && c.configs && c.calibracao,
      }),
    );
    grafico.replaceChildren(blocoGrafico({ serie: serieComPlano, carregou: planoPronto, hoje, treinoDoDia, esportesDoDia }));
    linha.replaceChildren(
      blocoAtividades({ atividades: dados.ultimas, carregou: c.ultimas }),
      blocoPeso(),
      blocoSugestao(),
    );
  }
  desenhar();

  // Cada assinatura guarda seu pedaço dos dados em `chave` e marca `flag` como carregado (um erro conta como
  // "carregado, vazio").
  const ouvir = (chave, flag, assinar) =>
    assinar(
      (lista) => {
        dados[chave] = lista;
        dados.carregou[flag] = true;
        if (chave === 'dias') pedirReconstrucaoSeVazio(lista);
        desenhar();
      },
      () => {
        dados.carregou[flag] = true;
        desenhar();
      },
    );

  const cancelar = [
    ouvir('dias', 'dias', (ok, erro) => observarEstresseDiario(sessao.uid, ok, erro)),
    ouvir('ultimas', 'ultimas', (ok, erro) => observarUltimasAtividades(sessao.uid, 5, ok, erro)),
    ouvir('atividades', 'atividades', (ok, erro) => observarAtividadesDesde(sessao.uid, desdeHistorico, ok, erro)),
    ouvir('treinos', 'treinos', (ok, erro) => observarTreinos(sessao.uid, desdeHistorico, ok, erro)),
    ouvir('configs', 'configs', (ok, erro) => observarConfigs(sessao.uid, ok, erro)),
    ouvir('metasCondicionamento', 'metasCondicionamento', (ok, erro) => observarMetasCondicionamento(sessao.uid, ok, erro)),
    observarCalibracaoDoUsuario(sessao.uid, ({ efetiva }) => {
      dados.calibracao = efetiva;
      dados.carregou.calibracao = true;
      desenhar();
    }),
  ];

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
