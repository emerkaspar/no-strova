import { connectFirestoreEmulator, doc, getDoc, getFirestore, onSnapshot } from 'firebase/firestore';
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
