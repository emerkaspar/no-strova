import { ehAdmin, type Perfil, RECURSOS, temRecurso, usuarioPodeAcessar } from "@no-strova/domain";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase";

export function exigirLogin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  return uid;
}

/** Garante que o chamador está aprovado, ativo e com o aceite LGPD em dia (fonte: users/{uid}, só Admin SDK escreve). */
export async function exigirAcesso(request: CallableRequest): Promise<{ uid: string; perfil: Perfil }> {
  const uid = exigirLogin(request);
  const perfil = (await db.doc(`users/${uid}`).get()).data() as Perfil | undefined;
  if (!usuarioPodeAcessar(perfil)) {
    throw new HttpsError("permission-denied", "Seu acesso ainda não está liberado.");
  }
  return { uid, perfil: perfil as Perfil };
}

const NOMES_RECURSOS: Record<string, string> = {
  [RECURSOS.IA]: "As sugestões com IA",
  [RECURSOS.GARMIN]: "A sincronização com o Garmin",
  [RECURSOS.STRAVA]: "A sincronização com o Strava",
};

/** Como `exigirAcesso`, e ainda confere se o admin liberou o recurso para este usuário (`users/{uid}.recursos`). */
export async function exigirRecurso(
  request: CallableRequest,
  recurso: (typeof RECURSOS)[keyof typeof RECURSOS],
): Promise<{ uid: string; perfil: Perfil }> {
  const acesso = await exigirAcesso(request);
  if (!temRecurso(acesso.perfil, recurso)) {
    throw new HttpsError("permission-denied", `${NOMES_RECURSOS[recurso]} não está liberada para a sua conta. Fale com o administrador.`);
  }
  return acesso;
}

/** Garante que o chamador é admin aprovado e ativo. A fonte autoritativa é users/{uid} (só Admin SDK escreve). */
export async function exigirAdmin(request: CallableRequest): Promise<string> {
  const uid = exigirLogin(request);
  const snap = await db.doc(`users/${uid}`).get();
  if (!ehAdmin(snap.data())) {
    throw new HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
  }
  return uid;
}

export function lerObjeto(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Dados da requisição inválidos.");
  }
  return data as Record<string, unknown>;
}
