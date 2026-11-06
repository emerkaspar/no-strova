import { progressoDaMetaCondicionamento, ZONAS } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarNumero } from '../../utils/formatters.js';

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

const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * Mini-cartão "Descanso e recuperação" (dias sem treino planejado): os dias de descanso da semana e há quanto tempo
 * se vem treinando ou descansando.
 * @param {{ descansosNaSemana: number, diasSemTreinoSeguidos: number, diasTreinandoSeguidos: number }} d ver descansoERecuperacao
 */
export function cartaoDescanso({ descansosNaSemana, diasSemTreinoSeguidos, diasTreinandoSeguidos }) {
  let nota;
  if (diasSemTreinoSeguidos === 0) nota = `${dias(diasTreinandoSeguidos)} seguidos treinando, hoje incluído.`;
  else if (diasTreinandoSeguidos > 0) nota = `Vindo de ${dias(diasTreinandoSeguidos)} seguidos treinando. Hoje é dia de recuperar.`;
  else nota = `${dias(diasSemTreinoSeguidos)} seguidos sem treinar.`;
  return h(
    'div',
    { class: 'semana-mini semana-descanso' },
    h('p', { class: 'semana-mini-rotulo' }, 'Descanso e recuperação'),
    h('p', { class: 'semana-mini-valor' }, h('span', { class: 'semana-mini-numero' }, String(descansosNaSemana)), ` ${descansosNaSemana === 1 ? 'dia' : 'dias'} sem treino na semana`),
    h('p', { class: 'semana-mini-nota' }, nota),
  );
}

/**
 * Mini-cartão "Dica do dia": uma dica curta sobre uma zona de FC, com a faixa em bpm do atleta quando há configuração.
 * @param {{ dica: { zona: string, texto: string }, faixaBpm: [number, number]|null }} p
 */
export function cartaoDicaDoDia({ dica, faixaBpm }) {
  return h(
    'div',
    { class: 'semana-mini semana-dica' },
    h('p', { class: 'semana-mini-rotulo' }, 'Dica do dia'),
    h('p', { class: 'semana-mini-valor' }, ZONAS[dica.zona]?.rotulo ?? dica.zona),
    faixaBpm ? h('p', { class: 'semana-mini-nota semana-dica-faixa' }, `${faixaBpm[0]}–${faixaBpm[1]} bpm`) : null,
    h('p', { class: 'semana-mini-nota' }, dica.texto),
  );
}

/**
 * Mini-cartão da meta de Condicionamento: do valor de hoje ao alvo, o progresso e o que o plano atual entrega.
 * Sem meta, convida a definir uma no Plano.
 * @param {{ meta: any|null, avaliacao: any|null, condicionamentoAtual: number|null }} p
 */
export function cartaoMetaCondicionamento({ meta, avaliacao, condicionamentoAtual }) {
  if (!meta) {
    return h(
      'div',
      { class: 'semana-mini semana-meta' },
      h('p', { class: 'semana-mini-rotulo' }, 'Meta de Condicionamento'),
      h('p', { class: 'semana-mini-valor' }, 'Nenhuma meta definida'),
      h('p', { class: 'semana-mini-nota' }, 'Escolha o Condicionamento que quer atingir e a data. ', h('a', { href: '#/plano' }, 'Definir no Plano')),
    );
  }
  const progresso = progressoDaMetaCondicionamento({ condicionamentoAtual, condicionamentoAlvo: meta.condicionamentoAlvo });
  const pct = progresso === null ? null : Math.round(progresso * 100);
  const data = formatarData(meta.dataAlvo);
  let nota;
  if (!avaliacao || avaliacao.estado === 'sem-dados') nota = `Planeje treinos até ${data} para ver a projeção.`;
  else if (avaliacao.estado === 'atinge') nota = `Plano atual: chega lá em ${data} (Condicionamento ${formatarNumero(avaliacao.condicionamentoProjetado, 1)}).`;
  else if (avaliacao.estado === 'abaixo') nota = `Plano atual: fica ${formatarNumero(Math.abs(avaliacao.diferenca), 1)} pontos abaixo em ${data}.`;
  else nota = `Plano atual: passa ${formatarNumero(Math.abs(avaliacao.diferenca), 1)} pontos do alvo em ${data}.`;
  return h(
    'div',
    { class: `semana-mini semana-meta${avaliacao?.agressiva ? ' semana-meta-agressiva' : ''}` },
    h('p', { class: 'semana-mini-rotulo' }, 'Meta de Condicionamento'),
    h(
      'p',
      { class: 'semana-mini-valor' },
      condicionamentoAtual === null ? '' : `${formatarNumero(condicionamentoAtual, 1)} → `,
      h('span', { class: 'semana-mini-numero' }, formatarNumero(meta.condicionamentoAlvo, 1)),
      pct === null ? null : ` · ${pct}%`,
    ),
    pct === null
      ? null
      : h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso da meta de Condicionamento' }, h('span', { style: `width:${pct}%` })),
    h('p', { class: 'semana-mini-nota' }, nota),
    avaliacao?.agressiva ? h('p', { class: 'semana-mini-nota semana-meta-aviso' }, 'Ritmo agressivo: veja o Plano.') : null,
  );
}
