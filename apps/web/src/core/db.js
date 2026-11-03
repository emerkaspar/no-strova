import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { EMULADORES, USAR_EMULADORES } from './constants.js';
import { app } from './firebase.js';

const db = getFirestore(app);
if (USAR_EMULADORES) connectFirestoreEmulator(db, EMULADORES.firestore.host, EMULADORES.firestore.port);

/** Lê um documento pelo caminho. Retorna os dados ou null se não existir. */
export async function lerDocumento(caminho) {
  const snap = await getDoc(doc(db, caminho));
  return snap.exists() ? snap.data() : null;
}

/**
 * Observa um documento. Quem chama deve cancelar o listener ao sair da tela.
 * @returns {() => void} função que cancela o listener
 */
export function observarDocumento(caminho, aoDados, aoErro) {
  return onSnapshot(
    doc(db, caminho),
    (snap) => aoDados(snap.exists() ? snap.data() : null),
    aoErro,
  );
}

/**
 * Observa uma consulta. Quem chama deve cancelar o listener ao sair da tela.
 * @param {string} colecao
 * @param {{ onde?: Array<[string, string, unknown]>, ordenarPor?: Array<[string, ('asc'|'desc')?]>, limite?: number }} opcoes
 * @returns {() => void} função que cancela o listener
 */
export function observarConsulta(colecao, { onde = [], ordenarPor = [], limite } = {}, aoDados, aoErro) {
  const restricoes = [
    ...onde.map(([campo, operador, valor]) => where(campo, operador, valor)),
    ...ordenarPor.map(([campo, direcao = 'asc']) => orderBy(campo, direcao)),
  ];
  if (limite) restricoes.push(limit(limite));
  return onSnapshot(
    query(collection(db, colecao), ...restricoes),
    (snap) => aoDados(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    aoErro,
  );
}

/** Grava (substitui) um documento. */
export function gravarDocumento(caminho, dados) {
  return setDoc(doc(db, caminho), dados);
}

/** Atualiza campos de um documento existente. */
export function atualizarDocumento(caminho, campos) {
  return updateDoc(doc(db, caminho), campos);
}

export function excluirDocumento(caminho) {
  return deleteDoc(doc(db, caminho));
}
