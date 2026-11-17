import { observarConsulta } from '../core/db.js';

/** Dias de histórico que a tela Saúde carrega de início: cobre os 60 dias do gráfico e o período padrão de "Treino e corpo". */
export const DIAS_CARREGADOS_BEM_ESTAR = 90;

/**
 * Passos e sono por dia do usuário desde `desde` (YYYY-MM-DD), em ordem de data. `dias` é o tamanho da janela (define o limite
 * de documentos lidos; `null` = todo o histórico). Cancele o listener ao sair da tela.
 */
export function observarBemEstar(uid, desde, aoDados, aoErro, dias = DIAS_CARREGADOS_BEM_ESTAR) {
  const limite = dias === null ? 4000 : dias + 5;
  return observarConsulta('bemEstar', { onde: [['userId', '==', uid], ['data', '>=', desde]], ordenarPor: [['data', 'asc']], limite }, aoDados, aoErro);
}
