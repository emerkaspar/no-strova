import { carimboDeServidor, excluirDocumento, gravarDocumento, gravarEmLote, observarConsulta } from '../core/db.js';
import { novoId } from './planoRepo.js';

const PESAGENS = 'pesagens';
const METAS_PESO = 'metasPeso';

/** Id da pesagem de um dia: uma por dia, então gravar de novo na mesma data substitui a anterior. */
export const idDaPesagem = (uid, data) => `${uid}_${data.replaceAll('-', '')}`;

/** Pesagens do usuário em ordem de data. Cancele o listener ao sair da tela. */
export function observarPesagens(uid, aoDados, aoErro) {
  return observarConsulta(PESAGENS, { onde: [['userId', '==', uid]], ordenarPor: [['data', 'asc']], limite: 2000 }, aoDados, aoErro);
}

/** Grava (ou substitui) a pesagem do dia. `valores`: { data, pesoKg }, já validados. */
export function gravarPesagem(uid, valores) {
  return gravarDocumento(`${PESAGENS}/${idDaPesagem(uid, valores.data)}`, { userId: uid, ...valores, criadoEm: carimboDeServidor() });
}

export function excluirPesagem(id) {
  return excluirDocumento(`${PESAGENS}/${id}`);
}

/** Metas de peso do usuário (a ativa e as anteriores). A ordenação fica por conta de quem chama. */
export function observarMetasPeso(uid, aoDados, aoErro) {
  return observarConsulta(METAS_PESO, { onde: [['userId', '==', uid]] }, aoDados, aoErro);
}

/** Define a meta ativa: passa a(s) ativa(s) para "anterior" e cria a nova, tudo de uma vez. */
export async function definirMetaPeso(uid, valores, metasAtivas = []) {
  const operacoes = metasAtivas.map((m) => ({ tipo: 'update', caminho: `${METAS_PESO}/${m.id}`, dados: { status: 'anterior' } }));
  operacoes.push({
    tipo: 'set',
    caminho: `${METAS_PESO}/${novoId()}`,
    dados: { userId: uid, ...valores, status: 'ativa', criadoEm: carimboDeServidor() },
  });
  await gravarEmLote(operacoes);
}

export function excluirMetaPeso(id) {
  return excluirDocumento(`${METAS_PESO}/${id}`);
}
