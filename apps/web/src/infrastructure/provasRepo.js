import { atualizarDocumento, carimboDeServidor, excluirDocumento, gravarDocumento, observarConsulta } from '../core/db.js';
import { novoId } from './planoRepo.js';

const PROVAS = 'provas';

/** Provas do usuário de uma data (yyyy-mm-dd) em diante, da mais próxima à mais distante. Cancele o listener ao sair da tela. */
export function observarProvas(uid, desdeData, aoDados, aoErro) {
  return observarConsulta(
    PROVAS,
    { onde: [['userId', '==', uid], ['data', '>=', desdeData]], ordenarPor: [['data', 'asc']], limite: 100 },
    aoDados,
    aoErro,
  );
}

/** Cria uma prova. `valores` já validado (ver validarProva). Retorna o id. */
export async function criarProva(uid, valores) {
  const id = novoId();
  await gravarDocumento(`${PROVAS}/${id}`, { userId: uid, ...valores, criadoEm: carimboDeServidor() });
  return id;
}

export function atualizarProva(id, valores) {
  return atualizarDocumento(`${PROVAS}/${id}`, valores);
}

export function excluirProva(id) {
  return excluirDocumento(`${PROVAS}/${id}`);
}
