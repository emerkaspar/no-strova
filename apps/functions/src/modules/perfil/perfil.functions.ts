import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirLogin } from "../../shared/guards";

/** URL assinada (1 h) da foto de perfil do próprio usuário; `null` se ele não enviou foto. O Storage nega leitura direta. */
export const obterUrlAvatar = onCall({ region: REGIAO }, async (request) => {
  const uid = exigirLogin(request);
  const arquivo = getStorage().bucket().file(`avatares/${uid}/foto.jpg`);
  const [existe] = await arquivo.exists();
  if (!existe) return { url: null };
  try {
    const [url] = await arquivo.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return { url };
  } catch (err) {
    logger.error("Falha ao gerar a URL assinada do avatar", err);
    return { url: null };
  }
});
