import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso } from "../../shared/guards";
import { aplicarMudancaDeAtividade } from "../calibracao/calibracao.service";
import { concederConquistasDoUsuario } from "../objetivos/objetivos.service";
import { recalcularDia, reconstruirTudo } from "./estresse.service";

const CAMPOS_DO_TRAJETO = new Set(["trajetoId", "trajetoTrecho"]);

/** A gravação mexeu só no trajeto da atividade (`trajetoId` e/ou `trajetoTrecho`)? Criar e excluir nunca são só trajeto. */
function soMudouOTrajeto(antes: FirebaseFirestore.DocumentData | undefined, depois: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!antes || !depois) return false;
  let mudouTrajeto = false;
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if (JSON.stringify(antes[campo]) === JSON.stringify(depois[campo])) continue;
    if (!CAMPOS_DO_TRAJETO.has(campo)) return false;
    mudouTrajeto = true;
  }
  return mudouTrajeto;
}

/**
 * Mantém estresseDiario em dia a cada mudança em atividades (criar, recalcular HRSS, excluir).
 * Recalcula o dia inteiro a partir das atividades, então retentativas são inofensivas. Aproveita a mesma execução
 * para manter o resumo de calibração da estimativa de HRSS (1 leitura e 1 gravação, só quando a atividade conta).
 */
export const onAtividadeWrite = onDocumentWritten({ document: "atividades/{id}", region: REGIAO }, async (event) => {
  // trajeto e trecho do trajeto não entram no estresse, na calibração nem nos objetivos: refazer o trecho de um trajeto
  // inteiro não deve acordar tudo isso para cada atividade
  if (soMudouOTrajeto(event.data?.before.data(), event.data?.after.data())) return;
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
    try {
      // objetivos atingidos com esta atividade ganham a badge (depois do estresse diário, de que o Condicionamento depende)
      await concederConquistasDoUsuario(uid);
    } catch (err) {
      logger.error("Falha ao conferir os objetivos do usuário", err);
    }
  }
});

/** Reconstrói a agregação diária do usuário (atividades anteriores ao trigger). */
export const reconstruirEstresseDiario = onCall({ region: REGIAO, timeoutSeconds: 120 }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return reconstruirTudo(uid);
});
