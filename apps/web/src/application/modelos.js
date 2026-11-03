import { validarTreinoEstruturado } from '@no-strova/domain';

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
