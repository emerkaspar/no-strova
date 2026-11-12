import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirLogin } from "../../shared/guards";

type Arquivo = ReturnType<ReturnType<ReturnType<typeof getStorage>["bucket"]>["file"]>;

/**
 * Link com token de download do Firebase (não depende de permissão de assinatura do IAM). O token é aleatório,
 * só é entregue ao dono pela callable e muda a cada nova foto (o upload recria o arquivo sem token).
 */
async function urlComToken(arquivo: Arquivo): Promise<string> {
  const [meta] = await arquivo.getMetadata();
  let token = String(meta.metadata?.firebaseStorageDownloadTokens ?? "").split(",")[0];
  if (!token) {
    token = randomUUID();
    await arquivo.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${arquivo.bucket.name}/o/${encodeURIComponent(arquivo.name)}?alt=media&token=${token}`;
}

/** URL da foto de perfil do próprio usuário (válida enquanto a foto não mudar); `null` se ele não enviou foto. O Storage nega leitura direta. */
export const obterUrlAvatar = onCall({ region: REGIAO }, async (request) => {
  const uid = exigirLogin(request);
  const arquivo = getStorage().bucket().file(`avatares/${uid}/foto.jpg`);
  const [existe] = await arquivo.exists();
  if (!existe) return { url: null };
  try {
    const [url] = await arquivo.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return { url };
  } catch (err) {
    // Sem iam.serviceAccounts.signBlob na conta de serviço: cai no link com token.
    logger.warn("Sem permissão para assinar a URL do avatar; usando o link com token", err);
  }
  try {
    return { url: await urlComToken(arquivo) };
  } catch (err) {
    logger.error("Falha ao gerar a URL do avatar", err);
    return { url: null };
  }
});
