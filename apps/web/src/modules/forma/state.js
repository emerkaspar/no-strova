import { PERIODO_PADRAO } from '../../application/forma.js';

/**
 * Estado do gráfico de forma (mantido ao navegar e voltar): período, barras e o esporte da linha de eficiência (EF).
 * `eficiencia`: null = sem escolha (ciclismo), '' = desligada, ou 'corrida' / 'ciclismo'.
 */
export const estadoForma = {
  periodo: PERIODO_PADRAO,
  barras: true,
  eficiencia: null,
};
