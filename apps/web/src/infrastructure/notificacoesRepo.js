import { observarConsulta } from '../core/db.js';

const LIMITE_PENDENTES = 200;
const LIMITE_HISTORICO = 100;

/** Notificações não lidas (as que ficam no sino e na aba "Não lidas"), da mais nova para a mais antiga. */
export function observarNaoLidas(uid, aoDados, aoErro) {
  return observarConsulta(
    'notificacoes',
    { onde: [['userId', '==', uid], ['lida', '==', false]], ordenarPor: [['criadoEm', 'desc']], limite: LIMITE_PENDENTES },
    aoDados,
    aoErro,
  );
}

/** As últimas notificações, lidas ou não (aba "Todas"). */
export function observarTodas(uid, aoDados, aoErro) {
  return observarConsulta('notificacoes', { onde: [['userId', '==', uid]], ordenarPor: [['criadoEm', 'desc']], limite: LIMITE_HISTORICO }, aoDados, aoErro);
}
