import { calcularSerieForma, recortarSerie } from '@no-strova/domain';

/** Períodos do gráfico. `dias: null` mostra tudo desde a primeira atividade. */
export const PERIODOS = Object.freeze([
  { id: '30', rotulo: '30 dias', dias: 30 },
  { id: '90', rotulo: '90 dias', dias: 90 },
  { id: '180', rotulo: '6 meses', dias: 183 },
  { id: '365', rotulo: '1 ano', dias: 365 },
  { id: 'tudo', rotulo: 'Tudo', dias: null },
]);

export const PERIODO_PADRAO = '90';

/**
 * Série diária de Fitness, Fadiga e Forma até hoje, a partir do estresse diário gravado.
 * Os dias entre o último treino e hoje entram com estresse 0 (Fitness e Fadiga decaem).
 * @param {Array<{ data: string, estresse: number }>} estresseDiario
 * @param {string} hoje yyyy-mm-dd
 */
export function montarSerie(estresseDiario, hoje) {
  return calcularSerieForma(
    estresseDiario.map(({ data, estresse }) => ({ data, estresse })),
    { ate: hoje },
  );
}

export function recortarPeriodo(serie, periodoId) {
  const periodo = PERIODOS.find((p) => p.id === periodoId) ?? PERIODOS[1];
  return recortarSerie(serie, periodo.dias);
}

/** Soma do estresse nos últimos `dias` dias da série (carga recente). */
export function cargaRecente(serie, dias = 7) {
  return serie.slice(-dias).reduce((soma, d) => soma + d.estresse, 0);
}
