import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, lerObjeto } from "../../shared/guards";
import { carregarConfigs } from "./atividades.service";
import * as servico from "./trajetos.service";

/**
 * Define a rota de referência do trajeto (uma atividade, inteira ou uma faixa dela) e refaz o trecho das atividades do trajeto.
 * Lê a série de cada atividade do trajeto, por isso o tempo e a memória maiores.
 */
export const definirRotaDoTrajeto = onCall({ region: REGIAO, memory: "512MiB", timeoutSeconds: 300 }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return servico.definirRotaDoTrajeto(uid, lerObjeto(request.data), () => carregarConfigs(uid));
});

/** Ajuste manual do trecho do trajeto em uma atividade (faixa em metros, atividade inteira ou volta à detecção pela rota). */
export const ajustarTrechoDaAtividade = onCall({ region: REGIAO, memory: "512MiB" }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return servico.ajustarTrechoDaAtividade(uid, lerObjeto(request.data), () => carregarConfigs(uid));
});
