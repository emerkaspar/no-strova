import { observarDocumento } from '../core/db.js';

/**
 * A última semana montada pela IA na rotina de domingo (só o servidor escreve): `{ inicio, fim, status, resumo?, consideracoes?,
 * itens?, avisos?, erro?, geradoEm }` ou null enquanto nunca rodou. `status`: gerada, sem-treinos ou falhou.
 */
export function observarSemanaIa(uid, aoDados, aoErro) {
  return observarDocumento(`semanaIa/${uid}`, aoDados, aoErro);
}
