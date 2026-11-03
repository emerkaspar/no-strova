import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { EMULADORES, USAR_EMULADORES } from './constants.js';
import { app } from './firebase.js';

const auth = getAuth(app);
if (USAR_EMULADORES) connectAuthEmulator(auth, EMULADORES.auth, { disableWarnings: true });

/** @returns {() => void} função que cancela o listener */
export function observarSessao(aoMudar) {
  return onAuthStateChanged(auth, aoMudar);
}

export function entrar(email, senha) {
  return signInWithEmailAndPassword(auth, email, senha);
}

export function criarConta(email, senha) {
  return createUserWithEmailAndPassword(auth, email, senha);
}

export function sair() {
  return signOut(auth);
}

const MENSAGENS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
  'auth/weak-password': 'A senha é fraca demais. Use ao menos 8 caracteres.',
  'auth/user-disabled': 'Esta conta está bloqueada. Fale com o administrador.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com o servidor. Verifique sua internet.',
};

export function mensagemErroAuth(err) {
  return MENSAGENS[err?.code] ?? 'Não foi possível concluir a operação. Tente novamente.';
}
