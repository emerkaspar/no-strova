import { RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import * as servico from "./intervals.service";

/** Mesmo segredo que cifra a chave pessoal do Garmin (Secret Manager). Trocar o valor invalida as chaves já guardadas. */
const GARMIN_CHAVE_CRIPTO = defineSecret("GARMIN_CHAVE_CRIPTO");

export const intervalsSituacao = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.situacao(uid);
});

export const intervalsConectar = onCall({ region: REGIAO, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.conectar(uid, lerObjeto(request.data).chave, GARMIN_CHAVE_CRIPTO.value());
});

export const intervalsDesconectar = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await servico.desconectar(uid);
  return { ok: true };
});

/**
 * Envia os treinos planejados do período ao intervals.icu, que os repassa ao calendário do Garmin Connect (a próxima semana).
 * Usa a chave de API que o usuário guardou ao conectar.
 */
export const intervalsEnviarTreinos = onCall({ region: REGIAO, memory: "512MiB", timeoutSeconds: 120, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.enviarPlano(uid, servico.validarPeriodo(lerObjeto(request.data)), GARMIN_CHAVE_CRIPTO.value());
});
