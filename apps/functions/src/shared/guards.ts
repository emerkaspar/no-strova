import { ehAdmin } from "@no-strova/domain";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase";

export function exigirLogin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  return uid;
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
