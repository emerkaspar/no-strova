import { recortarJanela } from '../../application/plano.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { graficoForma } from '../../utils/graficoForma.js';

const DIAS_ANTES_DE_HOJE = 28;

/**
 * Cartão com o gráfico de Fitness, Fadiga e Forma, com a projeção do plano tracejada e a meta marcada.
 * @param {{ serie: any[], meta: any|null, avaliacao: any|null }} p
 */
export function criarCartaoProjecao({ serie, meta, avaliacao }) {
  const legenda = h(
    'ul',
    { class: 'legenda-inline' },
    h('li', null, h('span', { class: 'amostra amostra-fitness' }), ' Fitness'),
    h('li', null, h('span', { class: 'amostra amostra-fadiga' }), ' Fadiga'),
    h('li', null, h('span', { class: 'amostra amostra-forma' }), ' Forma'),
    h('li', null, h('span', { class: 'amostra amostra-projecao' }), ' Projeção'),
  );

  let conteudo;
  if (serie.length < 2) {
    conteudo = estadoVazio('Registre atividades e planeje treinos para ver a projeção.');
  } else {
    const temProjecao = serie.some((d) => d.projetado);
    conteudo = h(
      'div',
      null,
      graficoForma(recortarJanela(serie, DIAS_ANTES_DE_HOJE), {
        barras: true,
        faixas: true,
        marcarHoje: true,
        projecao: true,
        meta: meta && avaliacao && avaliacao.estado !== 'sem-dados' ? meta : null,
      }),
      temProjecao ? null : h('p', { class: 'texto-secundario' }, 'Planeje treinos para ver a projeção do Fitness, da Fadiga e da Forma nos próximos dias.'),
    );
  }

  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Projeção do plano'), legenda),
    conteudo,
  );
}
