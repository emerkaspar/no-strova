import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from './firebase.js';

/** Acesso ao FCM no navegador. Só o essencial: permissão, token e remoção. Quem decide o que fazer é `application/push.js`. */

/** O navegador sabe receber push (service worker, Push API e Notification)? */
export async function pushSuportado() {
  try {
    return 'Notification' in window && 'serviceWorker' in navigator && (await isSupported());
  } catch {
    return false;
  }
}

/** 'granted', 'denied' ou 'default' (ainda não perguntou); 'unsupported' sem a API de notificações. */
export function permissaoDoPush() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export const pedirPermissaoDoPush = () => Notification.requestPermission();

/** Token FCM deste aparelho, usando o service worker do app (que já trata os eventos push). */
export async function obterTokenDoPush() {
  const chave = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!chave) throw new Error('O push ainda não está configurado neste ambiente (falta a chave VAPID).');
  const registro = await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { vapidKey: chave, serviceWorkerRegistration: registro });
}

/** Invalida o token deste aparelho no FCM. */
export const apagarTokenDoPush = () => deleteToken(getMessaging(app));
