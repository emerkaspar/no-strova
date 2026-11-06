import { carimboDeServidor, excluirDocumento, gravarEmLote, observarConsulta } from '../core/db.js';
import { novoId } from './planoRepo.js';

const COLECAO = 'metasProgressao';

/** Metas de progressão do usuário (por semana, mês ou ano). Cancele o listener ao sair da tela. */
export function observarMetasProgressao(uid, aoDados, aoErro) {
  return observarConsulta(COLECAO, { onde: [['userId', '==', uid]], limite: 300 }, aoDados, aoErro);
}

/**
 * Cria a meta e, na mesma operação, ajusta as que ela substitui (`ate` = último dia da meta anterior, ou apaga a que
 * começava no mesmo período). `valores`: { periodo, inicio, tipo, valorAlvo, esportes }, já validados. Devolve o id.
 */
export async function criarMetaProgressao(uid, valores, ajustes = []) {
  const id = novoId();
  const operacoes = ajustes.map((a) =>
    a.apagar ? { tipo: 'delete', caminho: `${COLECAO}/${a.id}` } : { tipo: 'update', caminho: `${COLECAO}/${a.id}`, dados: { ate: a.ate } },
  );
  operacoes.push({ tipo: 'set', caminho: `${COLECAO}/${id}`, dados: { userId: uid, ...valores, ate: null, criadoEm: carimboDeServidor() } });
  await gravarEmLote(operacoes);
  return id;
}

/** Define até quando a meta recorrente vale (ela deixa de se aplicar aos períodos seguintes). */
export function encerrarMetaProgressao(id, ate) {
  return gravarEmLote([{ tipo: 'update', caminho: `${COLECAO}/${id}`, dados: { ate } }]);
}

/** Corrige a meta no próprio documento: `dados` = { valorAlvo, tipo, esportes }. */
export function atualizarMetaProgressao(id, dados) {
  return gravarEmLote([{ tipo: 'update', caminho: `${COLECAO}/${id}`, dados }]);
}

export function excluirMetaProgressao(id) {
  return excluirDocumento(`${COLECAO}/${id}`);
}
