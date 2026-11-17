import { observarConsulta } from '../core/db.js';

/** Dias de histórico que a tela Saúde carrega: ela mostra 14 dias e a média de 7, então 60 sobram (e poupam leituras). */
export const DIAS_CARREGADOS_BEM_ESTAR = 60;

/** Passos e sono por dia do usuário desde `desde` (YYYY-MM-DD), em ordem de data. Cancele o listener ao sair da tela. */
export function observarBemEstar(uid, desde, aoDados, aoErro) {
  return observarConsulta('bemEstar', { onde: [['userId', '==', uid], ['data', '>=', desde]], ordenarPor: [['data', 'asc']], limite: DIAS_CARREGADOS_BEM_ESTAR + 5 }, aoDados, aoErro);
}
