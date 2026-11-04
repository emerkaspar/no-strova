import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { app } from './firebase.js';

const auth = getAuth(app);

export function entrarComGoogle() {
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provedor);
}

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
  'auth/invalid-credential': 'Senha errada. Pelo menos o treino você lembra.',
  'auth/wrong-password': 'Senha errada. Pelo menos o treino você lembra.',
  'auth/user-not-found': 'Senha errada. Pelo menos o treino você lembra.',
  'auth/invalid-email': 'E-mail inválido. Confere aí.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
  'auth/weak-password': 'A senha é fraca demais. Use ao menos 8 caracteres.',
  'auth/user-disabled': 'Esta conta está bloqueada. Fale com o administrador.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.',
  'auth/account-exists-with-different-credential': 'Já existe uma conta com este e-mail. Entre com e-mail e senha.',
  'auth/network-request-failed': 'Sem conexão com o servidor. Verifique sua internet.',
};

export function mensagemErroAuth(err) {
  return MENSAGENS[err?.code] ?? 'Não foi possível concluir a operação. Tente novamente.';
}
