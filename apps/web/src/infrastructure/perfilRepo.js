import { atualizarDocumento, observarDocumento } from '../core/db.js';

/**
 * Observa o perfil users/{uid}. Cancele o listener ao sair da tela.
 * @returns {() => void}
 */
export function observarPerfil(uid, aoDados, aoErro) {
  return observarDocumento(`users/${uid}`, aoDados, aoErro);
}

/** O dono só pode alterar nome e data de nascimento (as regras do Firestore garantem). */
export function atualizarDadosPessoais(uid, { nome, dataNascimento }) {
  return atualizarDocumento(`users/${uid}`, { nome, dataNascimento });
}
