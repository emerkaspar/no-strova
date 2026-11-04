import { medalhasDasAtividades } from '@no-strova/domain';
import { observarAtividades } from '../infrastructure/atividadesRepo.js';

/**
 * Medalhas de recorde das atividades. As medalhas se calculam sobre todas as atividades do usuário, então a lista guarda aqui
 * o que já carregou e o detalhe reaproveita (sem ler tudo de novo a cada atividade aberta).
 */
let cache = null; // { uid, lista }

/** A lista de Atividades chama isto sempre que recebe dados novos. */
export function guardarAtividadesParaMedalhas(uid, lista) {
  cache = { uid, lista };
}

function lerUmaVez(uid) {
  return new Promise((resolver, rejeitar) => {
    let cancelar = () => {};
    cancelar = observarAtividades(
      uid,
      (lista) => {
        cancelar();
        resolver(lista);
      },
      rejeitar,
    );
  });
}

/**
 * Medalhas de uma atividade (do ouro ao bronze). Usa a lista já carregada pela tela de Atividades; se o usuário abriu o
 * detalhe direto, lê as atividades uma vez.
 * @returns {Promise<Array<object>>} ver `medalhasDasAtividades` (pódio e medalhas recentes)
 */
export async function medalhasDaAtividade(uid, atividadeId, hoje) {
  if (cache?.uid !== uid) cache = { uid, lista: await lerUmaVez(uid) };
  return medalhasDasAtividades(cache.lista, hoje).get(atividadeId) ?? [];
}
