import { h } from '../../utils/dom.js';
import { formatarDistancia, formatarNumero } from '../../utils/formatters.js';

/** Segundos → "1h 05min" ou "30min" (sem segundos: o resumo trabalha com totais). */
function duracaoCurta(segundos) {
  const minutos = Math.round(segundos / 60);
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas}h ${String(minutos % 60).padStart(2, '0')}min` : `${minutos}min`;
}

/** "▲ 20min", "▼ 12,0 km" ou "= igual", comparando com a semana passada. */
function variacao(atual, anterior, formatar) {
  const diferenca = atual - anterior;
  if (diferenca === 0) return atual === 0 ? '—' : '= igual';
  return `${diferenca > 0 ? '▲' : '▼'} ${formatar(Math.abs(diferenca))}`;
}

/**
 * Faixa com quatro números da semana (tempo, distância, atividades e carga) e a variação em relação ao mesmo
 * trecho da semana passada.
 * @param {{ atual: any, anterior: any }} comparativo ver comparativoSemanal
 */
export function resumoDaSemana({ atual, anterior }) {
  const percentual = (diferenca) => (anterior.carga > 0 ? `${formatarNumero((diferenca / anterior.carga) * 100, 0)}%` : formatarNumero(diferenca, 0));
  const itens = [
    { id: 'tempo', rotulo: 'Tempo', valor: atual.duracaoS > 0 ? duracaoCurta(atual.duracaoS) : '—', nota: variacao(atual.duracaoS, anterior.duracaoS, duracaoCurta) },
    { id: 'distancia', rotulo: 'Distância', valor: atual.distanciaM > 0 ? formatarDistancia(atual.distanciaM) : '—', nota: variacao(atual.distanciaM, anterior.distanciaM, (m) => formatarDistancia(m)) },
    { id: 'atividades', rotulo: 'Atividades', valor: String(atual.atividades), nota: variacao(atual.atividades, anterior.atividades, (n) => String(n)) },
    { id: 'carga', rotulo: 'Carga (HRSS)', valor: atual.carga > 0 ? formatarNumero(atual.carga, 0) : '—', nota: variacao(atual.carga, anterior.carga, percentual) },
  ];
  return h(
    'div',
    { class: 'semana-resumo-bloco' },
    h(
      'ul',
      { class: 'semana-resumo' },
      ...itens.map((i) =>
        h('li', { class: `semana-stat semana-stat-${i.id}` }, h('span', { class: 'semana-stat-rotulo' }, i.rotulo), h('strong', { class: 'semana-stat-valor' }, i.valor), h('span', { class: 'semana-stat-nota' }, i.nota)),
      ),
    ),
    h('p', { class: 'semana-legenda' }, 'Variação em relação ao mesmo trecho da semana passada.'),
  );
}

/** Barra "realizado × previsto" da semana, ou um convite a planejar quando não há treino planejado. */
export function progressoDaCarga({ realizado, planejado }) {
  if (!(planejado > 0)) {
    return h('p', { class: 'semana-progresso-vazio' }, 'Sem treinos planejados para o resto da semana.');
  }
  const previsto = realizado + planejado;
  const pct = Math.min(100, Math.round((realizado / previsto) * 100));
  return h(
    'div',
    { class: 'semana-progresso' },
    h('p', { class: 'semana-progresso-texto' }, h('strong', null, 'Carga da semana'), h('span', null, `${formatarNumero(realizado, 0)} de ${formatarNumero(previsto, 0)} (${pct}%)`)),
    h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Carga realizada da semana' }, h('span', { style: `width:${pct}%` })),
    h('p', { class: 'semana-legenda' }, `Faltam ${formatarNumero(planejado, 0)} para fechar o plano.`),
  );
}

/**
 * Mini-cartão do próximo treino planejado.
 * @param {{ titulo: string, quando: string, estresse: number }|null} proximo
 */
export function cartaoProximoTreino(proximo) {
  return h(
    'div',
    { class: 'semana-mini semana-proximo' },
    h('p', { class: 'semana-mini-rotulo' }, 'Próximo treino'),
    proximo
      ? [
          h('p', { class: 'semana-mini-valor' }, proximo.titulo),
          h('p', { class: 'semana-mini-nota' }, `${proximo.quando} · ~${formatarNumero(proximo.estresse, 0)} de carga`),
        ]
      : [h('p', { class: 'semana-mini-valor' }, 'Nenhum treino planejado')],
  );
}

const semanas = (n) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;

/** Mini-cartão da sequência de semanas seguidas com treino. */
export function cartaoSequencia({ atual, recorde, nestaSemana }) {
  const nota =
    atual === 0
      ? 'Um treino esta semana começa uma sequência.'
      : nestaSemana
        ? `Recorde: ${semanas(recorde)}.`
        : `Treine esta semana para manter. Recorde: ${semanas(recorde)}.`;
  return h(
    'div',
    { class: 'semana-mini semana-sequencia' },
    h('p', { class: 'semana-mini-rotulo' }, 'Sequência'),
    h('p', { class: 'semana-mini-valor' }, h('span', { class: 'semana-mini-numero' }, String(atual)), ` ${atual === 1 ? 'semana seguida' : 'semanas seguidas'} treinando`),
    h('p', { class: 'semana-mini-nota' }, nota),
  );
}
