import { inicioDaSemana, montarSemana } from '@no-strova/domain';
import { montarSerie, pedirReconstrucaoSeVazio } from '../../application/forma.js';
import { observarAtividadesDesde, observarUltimasAtividades } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { h } from '../../utils/dom.js';
import { hojeIso } from '../../utils/formatters.js';
import { blocoAtividades, blocoForma, blocoGrafico, blocoPeso, blocoSemana, blocoSugestao } from './blocos.js';

/**
 * Início: Forma hoje, gráfico de Fitness/Fadiga, semana atual e uma linha com últimas atividades,
 * peso e sugestão. Cada bloco mostra um estado vazio curto enquanto não há dados.
 */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const segunda = inicioDaSemana(hoje);
  const dados = {
    dias: [],
    ultimas: [],
    daSemana: [],
    carregou: { dias: false, ultimas: false, semana: false },
  };
  let ativa = true;

  const topo = h('div', { class: 'inicio-topo' });
  const semana = h('div');
  const linha = h('div', { class: 'inicio-linha' });
  raiz.replaceChildren(h('div', { class: 'inicio' }, topo, semana, linha));

  function desenhar() {
    if (!ativa) return;
    const serie = dados.carregou.dias ? montarSerie(dados.dias, hoje) : [];
    topo.replaceChildren(
      blocoForma({ serie, carregou: dados.carregou.dias, semHrss: dados.carregou.dias && dados.dias.length > 0 && serie.length === 0 }),
      blocoGrafico({ serie, carregou: dados.carregou.dias }),
    );
    semana.replaceChildren(
      blocoSemana({
        semana: montarSemana(hoje, { realizado: dados.dias.filter((d) => d.data >= segunda) }),
        atividades: dados.daSemana,
        carregou: dados.carregou.dias && dados.carregou.semana,
      }),
    );
    linha.replaceChildren(
      blocoAtividades({ atividades: dados.ultimas, carregou: dados.carregou.ultimas }),
      blocoPeso(),
      blocoSugestao(),
    );
  }
  desenhar();

  const cancelar = [
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        dados.dias = lista;
        dados.carregou.dias = true;
        pedirReconstrucaoSeVazio(lista);
        desenhar();
      },
      () => {
        dados.carregou.dias = true;
        desenhar();
      },
    ),
    observarUltimasAtividades(
      sessao.uid,
      5,
      (lista) => {
        dados.ultimas = lista;
        dados.carregou.ultimas = true;
        desenhar();
      },
      () => {
        dados.carregou.ultimas = true;
        desenhar();
      },
    ),
    observarAtividadesDesde(
      sessao.uid,
      segunda,
      (lista) => {
        dados.daSemana = lista;
        dados.carregou.semana = true;
        desenhar();
      },
      () => {
        dados.carregou.semana = true;
        desenhar();
      },
    ),
  ];

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
