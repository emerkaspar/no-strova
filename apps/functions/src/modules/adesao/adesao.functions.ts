import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAdmin } from "../../shared/guards";
import { montarPainelAdesao } from "./adesao.service";

/** Painel de adesão do administrador: quem usa o sistema e quem conectou intervals.icu/Garmin. Só contagens e datas. */
export const painelAdesao = onCall({ region: REGIAO, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  await exigirAdmin(request);
  return montarPainelAdesao();
});
