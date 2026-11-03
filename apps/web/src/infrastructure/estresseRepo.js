import { observarConsulta } from '../core/db.js';

/**
 * Estresse diário do usuário (um doc por dia com treino), do mais antigo ao mais recente.
 * Quem chama cancela o listener ao sair da tela.
 * @returns {() => void}
 */
export function observarEstresseDiario(uid, aoDados, aoErro) {
  return observarConsulta(
    'estresseDiario',
    { onde: [['userId', '==', uid]], ordenarPor: [['data', 'asc']] },
    aoDados,
    aoErro,
  );
}
