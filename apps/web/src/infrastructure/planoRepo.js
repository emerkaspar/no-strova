import {
  atualizarDocumento,
  carimboDeServidor,
  excluirDocumento,
  gravarDocumento,
  gravarEmLote,
  observarConsulta,
} from '../core/db.js';

const TREINOS = 'treinosPlanejados';
const METAS = 'metasForma';

/** Id de 20 caracteres [a-f0-9], no mesmo formato dos ids automáticos do Firestore. */
export function novoId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 20);
}

/** Treinos planejados de uma data (yyyy-mm-dd) em diante, em ordem de data. Cancele o listener ao sair da tela. */
export function observarTreinos(uid, desdeData, aoDados, aoErro) {
  return observarConsulta(
    TREINOS,
    { onde: [['userId', '==', uid], ['data', '>=', desdeData]], ordenarPor: [['data', 'asc']], limite: 1500 },
    aoDados,
    aoErro,
  );
}

/** Cria um treino planejado. \`valores\` já validado (ver validarTreinoPlanejado). Retorna o id. */
export async function criarTreino(uid, valores, estresseEstimado) {
  const id = novoId();
  await gravarDocumento(`${TREINOS}/${id}`, {
    userId: uid,
    ...valores,
    estresseEstimado: estresseEstimado ?? null,
    status: 'planejado',
    atividadeId: null,
    criadoEm: carimboDeServidor(),
  });
  return id;
}

export function atualizarTreino(id, valores, estresseEstimado) {
  return atualizarDocumento(`${TREINOS}/${id}`, { ...valores, estresseEstimado: estresseEstimado ?? null });
}

/** Arrastar para outro dia: só a data muda. */
export function moverTreino(id, data) {
  return atualizarDocumento(`${TREINOS}/${id}`, { data });
}

export function vincularTreino(id, atividadeId) {
  return atualizarDocumento(`${TREINOS}/${id}`, { status: 'realizado', atividadeId });
}

export function desvincularTreino(id) {
  return atualizarDocumento(`${TREINOS}/${id}`, { status: 'planejado', atividadeId: null });
}

export function pularTreino(id) {
  return atualizarDocumento(`${TREINOS}/${id}`, { status: 'pulado' });
}

export function excluirTreino(id) {
  return excluirDocumento(`${TREINOS}/${id}`);
}

/** Metas de forma do usuário (ativa e anteriores). A ordenação fica por conta de quem chama. */
export function observarMetas(uid, aoDados, aoErro) {
  return observarConsulta(METAS, { onde: [['userId', '==', uid]] }, aoDados, aoErro);
}

/** Define a meta ativa: desativa as ativas anteriores e cria a nova, tudo de uma vez. */
export async function definirMeta(uid, valores, metasAtivas = []) {
  const operacoes = metasAtivas.map((m) => ({ tipo: 'update', caminho: `${METAS}/${m.id}`, dados: { ativa: false } }));
  operacoes.push({
    tipo: 'set',
    caminho: `${METAS}/${novoId()}`,
    dados: { userId: uid, ...valores, ativa: true, criadoEm: carimboDeServidor() },
  });
  await gravarEmLote(operacoes);
}

export function excluirMeta(id) {
  return excluirDocumento(`${METAS}/${id}`);
}
