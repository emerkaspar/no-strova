import { lerDocumento, observarConsulta } from '../core/db.js';

const COLECAO = 'trajetos';

/**
 * Trajetos de treino do usuário (uma leitura só), em ordem alfabética. Quem grava é a callable `salvarAtividade`.
 * @returns {Promise<Array<{ id: string, nome: string, esporte: string }>>}
 */
export function lerTrajetos(uid) {
  return new Promise((resolver, rejeitar) => {
    let cancelar = () => {};
    cancelar = observarConsulta(
      COLECAO,
      { onde: [['userId', '==', uid]] },
      (lista) => {
        cancelar();
        resolver(lista.sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR')));
      },
      rejeitar,
    );
  });
}

/** Um trajeto pelo id, ou null. */
export async function lerTrajeto(id) {
  const dados = await lerDocumento(`${COLECAO}/${id}`);
  return dados ? { id, ...dados } : null;
}
