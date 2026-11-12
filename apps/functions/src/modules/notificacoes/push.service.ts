import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";

/** Tokens de push (um por aparelho/navegador) em `users/{uid}/dispositivos`: sem regra de cliente, só o Admin SDK lê e grava. */
const colecao = (uid: string) => db.collection(`users/${uid}/dispositivos`);
const idDoToken = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 40);

const MAX_DISPOSITIVOS = 10;

function lerToken(token: unknown): string {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new HttpsError("invalid-argument", "Token de notificação inválido.");
  }
  return token;
}

/** Guarda (ou renova) o token do aparelho. Aparelhos antigos além do limite são descartados. */
export async function registrarDispositivo(uid: string, tokenBruto: unknown, plataforma: unknown): Promise<void> {
  const token = lerToken(tokenBruto);
  await colecao(uid)
    .doc(idDoToken(token))
    .set({ token, plataforma: typeof plataforma === "string" ? plataforma.slice(0, 40) : "web", atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  const todos = await colecao(uid).orderBy("atualizadoEm", "desc").get();
  const excedentes = todos.docs.slice(MAX_DISPOSITIVOS);
  if (excedentes.length > 0) {
    const lote = db.batch();
    for (const d of excedentes) lote.delete(d.ref);
    await lote.commit();
  }
}

export async function removerDispositivo(uid: string, tokenBruto: unknown): Promise<void> {
  await colecao(uid).doc(idDoToken(lerToken(tokenBruto))).delete();
}

const TOKEN_MORTO = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

/**
 * Envia o aviso como push para todos os aparelhos do usuário. Mensagem só de dados: quem monta e mostra a notificação é o
 * `push-sw.js`, que também abre a tela certa ao tocar. Tokens que o FCM diz estar mortos são apagados.
 * @returns quantos aparelhos receberam
 */
export async function enviarPush(uid: string, aviso: { id: string; titulo: string; mensagem: string; rota: string }): Promise<number> {
  const dispositivos = await colecao(uid).get();
  if (dispositivos.empty) return 0;
  const tokens = dispositivos.docs.map((d) => String(d.get("token")));
  const resposta = await getMessaging().sendEachForMulticast({
    tokens,
    data: { titulo: aviso.titulo, mensagem: aviso.mensagem, rota: aviso.rota, id: aviso.id },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  });
  const lote = db.batch();
  let mortos = 0;
  resposta.responses.forEach((r, i) => {
    if (!r.success && r.error && TOKEN_MORTO.has(r.error.code)) {
      lote.delete(dispositivos.docs[i].ref);
      mortos += 1;
    } else if (!r.success) {
      logger.warn("Push não entregue", { uid, codigo: r.error?.code });
    }
  });
  if (mortos > 0) await lote.commit();
  return resposta.successCount;
}
