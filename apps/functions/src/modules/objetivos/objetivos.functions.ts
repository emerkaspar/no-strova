import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso } from "../../shared/guards";
import { concederConquistasDoUsuario, marcarConquistasVistas } from "./objetivos.service";

/**
 * Criar ou alterar uma meta pode torná-la atingida de imediato (por exemplo, uma meta menor do que o que o usuário já
 * fez no período): confere e concede a badge.
 */
export const onMetaProgressaoWrite = onDocumentWritten({ document: "metasProgressao/{id}", region: REGIAO }, async (event) => {
  const uid = event.data?.after.data()?.userId;
  if (typeof uid !== "string") return;
  try {
    await concederConquistasDoUsuario(uid);
  } catch (err) {
    logger.error("Falha ao conferir objetivos depois de salvar a meta", err);
  }
});

/** Marca conquistas como vistas (some o selo "Nova"). O cliente não escreve em `conquistas`. */
export const marcarConquistasComoVistas = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const ids = Array.isArray(request.data?.ids) ? (request.data.ids as unknown[]).filter((v): v is string => typeof v === "string") : [];
  return { marcadas: await marcarConquistasVistas(uid, ids) };
});
