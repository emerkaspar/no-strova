import { avaliarObjetivo, calcularSerieForma, metaVale, periodoDe } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { cartaoDoObjetivo } from '../progressao/objetivos.js';
import { pedirMetaNaProgressao } from '../progressao/state.js';

const ORDEM = ['ano', 'mes', 'semana']; // anual, mensal e semanal

/** Meta mais recente entre as que valem hoje no período (várias metas no mesmo período: aparece a última criada). */
function metaDoPeriodo(metas, periodoAtual) {
  const validas = metas.filter((m) => metaVale(m, periodoAtual));
  validas.sort((a, b) => (b.criadoEm?.toMillis?.() ?? 0) - (a.criadoEm?.toMillis?.() ?? 0));
  return validas[0] ?? null;
}

/**
 * Bloco "Objetivos" da Início, acima do quadro da semana: um cartão por período (anual, mensal e semanal) com o mesmo
 * visual da tela de Progressão (progresso, status e marcador do esperado). Null quando não há objetivo vigente.
 */
export function blocoObjetivosInicio({ metas, atividades, dias, hoje }) {
  const vigentes = ORDEM.map((tipo) => {
    const periodo = periodoDe(tipo, hoje);
    return { periodo, meta: metaDoPeriodo(metas, periodo) };
  }).filter((x) => x.meta);
  if (vigentes.length === 0) return null;

  const precisaDeCondicionamento = vigentes.some((x) => x.meta.tipo === 'condicionamento');
  const condicionamentoPorData = precisaDeCondicionamento ? new Map(calcularSerieForma(dias, { ate: hoje }).map((d) => [d.data, d.fitness])) : new Map();

  // abre a Progressão já no período (semana, mês ou ano), tipo e esportes do objetivo clicado
  const abrirProgressao = (meta) => {
    pedirMetaNaProgressao(meta.id);
    window.location.hash = '#/progressao';
  };
  const cartoes = vigentes.map(({ meta, periodo }) => {
    const atual = avaliarObjetivo({ meta, periodo, atividades, condicionamentoPorData, hoje });
    // só o período em andamento: o histórico das metas recorrentes fica na tela de Progressão
    return cartaoDoObjetivo(meta, { atual, instancias: 0, atingidas: 0, naoAtingidas: 0, sequencia: 0 }, false, false, abrirProgressao, true);
  });

  return h(
    'section',
    { class: 'card bloco-objetivos' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Objetivos'), h('a', { class: 'link-acao', href: '#/progressao' }, 'Ver progressão', icone('seta', 16))),
    h('div', { class: 'obj-lista' }, cartoes),
  );
}
