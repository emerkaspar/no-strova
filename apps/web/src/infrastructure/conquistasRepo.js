import { observarConsulta } from '../core/db.js';

/** Conquistas (badges) do usuário: quem concede é o servidor. Cancele o listener ao sair da tela. */
export function observarConquistas(uid, aoDados, aoErro) {
  return observarConsulta('conquistas', { onde: [['userId', '==', uid]], limite: 500 }, aoDados, aoErro);
}
