import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { criarGraficoPrincipal } from '../inicio/graficoPrincipal.js';

/**
 * Cartão da projeção do plano: o mesmo gráfico do Início (Condicionamento e fadiga, Forma em barras por zona e
 * estresse do dia), em "modo plano": seletor com mais futuro, a meta de forma marcada e, ao clicar num dia, abre o
 * treino dele.
 * @param {{
 *   serie: any[], hoje: string, meta: any|null, avaliacao: any|null,
 *   metaCondicionamento: any|null, avaliacaoCondicionamento: any|null,
 *   treinoDoDia: (data: string) => any, aoClicarDia: (data: string) => void
 * }} p
 */
export function criarCartaoProjecao({ serie, hoje, meta, avaliacao, metaCondicionamento = null, avaliacaoCondicionamento = null, treinoDoDia, aoClicarDia }) {
  if (serie.length < 2) {
    return h(
      'section',
      { class: 'card' },
      h('h2', { class: 'titulo-bloco' }, 'Projeção do plano'),
      estadoVazio('Registre atividades e planeje treinos para ver a projeção.'),
    );
  }
  return criarGraficoPrincipal({
    serie,
    hoje,
    treinoDoDia,
    modo: 'plano',
    meta: meta && avaliacao && avaliacao.estado !== 'sem-dados' ? meta : null,
    metaCondicionamento: metaCondicionamento && avaliacaoCondicionamento && avaliacaoCondicionamento.estado !== 'sem-dados' ? metaCondicionamento : null,
    aoClicarDia,
  });
}
