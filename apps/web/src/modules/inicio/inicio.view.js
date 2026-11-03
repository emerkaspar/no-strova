import { estresseDoTreino, inicioDaSemana, montarSemana } from '@no-strova/domain';
import { montarSerie, pedirReconstrucaoSeVazio } from '../../application/forma.js';
import { montarProjecao } from '../../application/plano.js';
import { observarAtividadesDesde, observarUltimasAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarTreinos } from '../../infrastructure/planoRepo.js';
import { h } from '../../utils/dom.js';
import { hojeIso } from '../../utils/formatters.js';
import { blocoAtividades, blocoForma, blocoGrafico, blocoPeso, blocoSemana, blocoSugestao } from './blocos.js';

/** A projeção do Início mostra os próximos 14 dias (a tela do Plano mostra o horizonte completo). */
const DIAS_DE_PROJECAO = 14;

/**
 * Início: Forma hoje, gráfico de Fitness/Fadiga com a projeção do plano, semana atual (realizado e planejado)
 * e uma linha com últimas atividades, peso e sugestão. Cada bloco mostra um estado vazio curto sem dados.
 */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const segunda = inicioDaSemana(hoje);
  const dados = {
    dias: [],
    ultimas: [],
    daSemana: [],
    treinos: [],
    configs: [],
    carregou: { dias: false, ultimas: false, semana: false, treinos: false, configs: false },
  };
  let ativa = true;

  const topo = h('div', { class: 'inicio-topo' });
  const semana = h('div');
  const linha = h('div', { class: 'inicio-linha' });
  raiz.replaceChildren(h('div', { class: 'inicio' }, topo, semana, linha));

  function desenhar() {
    if (!ativa) return;
    const c = dados.carregou;
    // O destaque usa só o realizado: a Forma de hoje não depende do plano.
    const serieReal = c.dias ? montarSerie(dados.dias, hoje) : [];
    const planoPronto = c.dias && c.treinos && c.configs;
    const serieComPlano = planoPronto
      ? montarProjecao({ dias: dados.dias, treinos: dados.treinos, configs: dados.configs, meta: null, hoje, limiteDias: DIAS_DE_PROJECAO }).serie
      : [];

    // Treinos ainda por fazer nesta semana (hoje em diante), com o estresse estimado.
    const treinosDaSemana = dados.treinos.filter((t) => t.status === 'planejado' && t.data >= hoje && t.data >= segunda);
    const planejado = treinosDaSemana.map((t) => ({ data: t.data, estresse: estresseDoTreino(t, dados.configs) }));

    topo.replaceChildren(
      blocoForma({ serie: serieReal, carregou: c.dias, semHrss: c.dias && dados.dias.length > 0 && serieReal.length === 0 }),
      blocoGrafico({ serie: serieComPlano, carregou: planoPronto }),
    );
    semana.replaceChildren(
      blocoSemana({
        semana: montarSemana(hoje, { realizado: dados.dias.filter((d) => d.data >= segunda), planejado }),
        atividades: dados.daSemana,
        treinos: treinosDaSemana,
        carregou: c.dias && c.semana && c.treinos && c.configs,
      }),
    );
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
    ouvir('daSemana', 'semana', (ok, erro) => observarAtividadesDesde(sessao.uid, segunda, ok, erro)),
    ouvir('treinos', 'treinos', (ok, erro) => observarTreinos(sessao.uid, segunda, ok, erro)),
    ouvir('configs', 'configs', (ok, erro) => observarConfigs(sessao.uid, ok, erro)),
  ];

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
