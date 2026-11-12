import { atualizarDocumento, observarDocumento } from '../core/db.js';

/**
 * Observa o perfil users/{uid}. Cancele o listener ao sair da tela.
 * @returns {() => void}
 */
export function observarPerfil(uid, aoDados, aoErro) {
  return observarDocumento(`users/${uid}`, aoDados, aoErro);
}

/** O dono só pode alterar nome, data de nascimento e avatar (as regras do Firestore garantem). */
export function atualizarDadosPessoais(uid, { nome, dataNascimento }) {
  return atualizarDocumento(`users/${uid}`, { nome, dataNascimento });
}

/** Grava o avatar ('foto', 'personagem:<id>' ou null). `avatarEm` muda a cada troca para renovar o cache da foto. */
export function atualizarAvatar(uid, avatar) {
  return atualizarDocumento(`users/${uid}`, { avatar, avatarEm: Date.now() });
}
