import { validarTreinoEstruturado } from '@no-strova/domain';
import { observarModelos } from '../infrastructure/modelosRepo.js';

/**
 * Modelos próprios do usuário válidos, prontos para uso (com `origem: 'proprio'`). Os dados são escritos pelo cliente,
 * então são revalidados ao ler e os inválidos são ignorados.
 */
export function modelosProprios(lista) {
  const modelos = [];
  for (const doc of lista ?? []) {
    const r = validarTreinoEstruturado(doc);
    if (r.valido) modelos.push({ id: doc.id, ...r.valores, origem: 'proprio' });
  }
  return modelos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Lê uma vez os treinos próprios do usuário (para telas que não os assinam), já validados. */
export function carregarModelosProprios(uid) {
  return new Promise((resolve) => {
    let cancelar = () => {};
    let pronto = false;
    const concluir = (lista) => {
      if (pronto) return;
      pronto = true;
      cancelar();
      resolve(modelosProprios(lista));
    };
    cancelar = observarModelos(uid, concluir, () => concluir([]));
    if (pronto) cancelar();
  });
}
