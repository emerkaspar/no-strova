import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso } from "../../shared/guards";
import { aplicarMudancaDeAtividade } from "../calibracao/calibracao.service";
import { recalcularDia, reconstruirTudo } from "./estresse.service";

/**
 * Mantém estresseDiario em dia a cada mudança em atividades (criar, recalcular HRSS, excluir).
 * Recalcula o dia inteiro a partir das atividades, então retentativas são inofensivas. Aproveita a mesma execução
 * para manter o resumo de calibração da estimativa de HRSS (1 leitura e 1 gravação, só quando a atividade conta).
 */
export const onAtividadeWrite = onDocumentWritten({ document: "atividades/{id}", region: REGIAO }, async (event) => {
  const dias = new Set<string>();
  for (const dados of [event.data?.before.data(), event.data?.after.data()]) {
    if (typeof dados?.userId === "string" && typeof dados?.data === "string") dias.add(`${dados.userId}|${dados.data}`);
  }
  for (const chave of dias) {
    const [uid, data] = chave.split("|");
    await recalcularDia(uid, data);
  }

  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  const uid = [depois?.userId, antes?.userId].find((v): v is string => typeof v === "string");
  if (uid) {
    try {
      await aplicarMudancaDeAtividade(uid, event.params.id, antes, depois);
    } catch (err) {
      // A calibração é um refinamento: uma falha aqui não pode afetar o estresse diário. "Recalcular histórico" refaz.
      logger.error("Falha ao atualizar a calibração da estimativa", err);
    }
  }
});

/** Reconstrói a agregação diária do usuário (atividades anteriores ao trigger). */
export const reconstruirEstresseDiario = onCall({ region: REGIAO, timeoutSeconds: 120 }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return reconstruirTudo(uid);
});
