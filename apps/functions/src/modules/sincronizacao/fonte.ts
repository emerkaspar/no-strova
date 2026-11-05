import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";

export type FonteDeAtividades = "garmin" | "strava";

const NOMES: Record<FonteDeAtividades, string> = { garmin: "Garmin", strava: "Strava" };

/**
 * O usuário usa uma fonte só (Garmin ou Strava), porque quem tem Garmin costuma mandar as atividades ao Strava e
 * as duas fontes duplicariam tudo. A conexão de cada uma é o documento `users/{uid}/segredos/<fonte>`.
 */
export async function exigirOutraFonteDesconectada(uid: string, querConectar: FonteDeAtividades): Promise<void> {
  const outra: FonteDeAtividades = querConectar === "garmin" ? "strava" : "garmin";
  if ((await db.doc(`users/${uid}/segredos/${outra}`).get()).exists) {
    throw new HttpsError(
      "failed-precondition",
      `O ${NOMES[outra]} já está conectado. Desconecte o ${NOMES[outra]} antes de conectar o ${NOMES[querConectar]}: use só uma fonte para não duplicar atividades.`,
      { codigo: "outra-fonte-conectada" },
    );
  }
}
