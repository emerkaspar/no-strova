import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso } from "../../shared/guards";
import { reconstruirCalibracaoDoUsuario } from "./calibracao.service";

/** Reconstrói o resumo de calibração do usuário (atividades anteriores ao gatilho). */
export const reconstruirCalibracao = onCall({ region: REGIAO, timeoutSeconds: 120 }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return reconstruirCalibracaoDoUsuario(uid);
});
