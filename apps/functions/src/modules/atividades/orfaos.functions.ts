import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGIAO } from "../../shared/config";
import { db } from "../../shared/firebase";
import { limparOrfaos } from "./orfaos";

/** Todo dia às 03:30 (São Paulo): remove do Storage arquivos de atividade que nunca foram processados. */
export const limparArquivosOrfaos = onSchedule(
  { schedule: "every day 03:30", timeZone: "America/Sao_Paulo", region: REGIAO, timeoutSeconds: 300 },
  async () => {
    const bucket = getStorage().bucket();
    const removidos = await limparOrfaos(
      {
        async listar() {
          const [arquivos] = await bucket.getFiles({ prefix: "atividades/" });
          return arquivos.map((a) => ({ caminho: a.name, criadoEmMs: Date.parse(String(a.metadata.timeCreated)) }));
        },
        async donoDaAtividade(atividadeId) {
          const snap = await db.doc(`atividades/${atividadeId}`).get();
          return snap.exists ? String(snap.get("userId")) : null;
        },
        async apagar(caminho) {
          await bucket.file(caminho).delete({ ignoreNotFound: true });
        },
      },
      Date.now(),
    );
    logger.info("Limpeza de arquivos órfãos concluída", { removidos });
  },
);
