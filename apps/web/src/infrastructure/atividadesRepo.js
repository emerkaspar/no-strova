import { lerDocumento, observarConsulta } from '../core/db.js';

/** Atividades do usuário, da mais recente para a mais antiga. Quem chama cancela o listener ao sair da tela. */
export function observarAtividades(uid, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid]], ordenarPor: [['data', 'desc']], limite: 1000 },
    aoDados,
    aoErro,
  );
}

export function lerAtividade(id) {
  return lerDocumento(`atividades/${id}`);
}

/** Série de FC reduzida ({ t: segundos[], fc: bpm[] }) ou null. */
export function lerSerieFc(id) {
  return lerDocumento(`atividades/${id}/series/fc`);
}
