import { PERIODO_PADRAO } from '../../application/forma.js';

/** Estado do gráfico de forma: período e barras (mantidos ao navegar e voltar). */
export const estadoForma = {
  periodo: PERIODO_PADRAO,
  barras: true,
  /** A reconstrução da agregação é pedida no máximo uma vez por sessão. */
  reconstruiu: false,
};
