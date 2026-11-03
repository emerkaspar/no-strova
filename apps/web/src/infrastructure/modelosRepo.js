import { atualizarDocumento, carimboDeServidor, excluirDocumento, gravarDocumento, observarConsulta } from '../core/db.js';
import { novoId } from './planoRepo.js';

const COLECAO = 'treinosModelos';

/** Treinos intervalados próprios do usuário. O catálogo do sistema fica no código (`@no-strova/domain`). */
export function observarModelos(uid, aoDados, aoErro) {
  return observarConsulta(COLECAO, { onde: [['userId', '==', uid]] }, aoDados, aoErro);
}

/** Cria um modelo próprio. `valores` já validado (ver validarTreinoEstruturado). Retorna o id. */
export async function criarModelo(uid, valores) {
  const id = novoId();
  await gravarDocumento(`${COLECAO}/${id}`, { userId: uid, ...valores, criadoEm: carimboDeServidor() });
  return id;
}

export function atualizarModelo(id, valores) {
  return atualizarDocumento(`${COLECAO}/${id}`, valores);
}

export function excluirModelo(id) {
  return excluirDocumento(`${COLECAO}/${id}`);
}
