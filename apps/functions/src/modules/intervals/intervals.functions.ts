import { RECURSOS } from "@no-strova/domain";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import { criarNotificacao } from "../notificacoes/notificacoes.service";
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

/** Só leitura: compara o LTHR do No Strova com o do intervals.icu. */
export const intervalsLthr = onCall({ region: REGIAO, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.situacaoDoLthr(uid, GARMIN_CHAVE_CRIPTO.value());
});

/** Grava o LTHR do No Strova no intervals.icu (só por pedido do usuário, nos esportes escolhidos). */
export const intervalsAtualizarLthr = onCall({ region: REGIAO, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.atualizarLthrNoIntervals(uid, servico.validarEsportesDoLthr(lerObjeto(request.data).esportes), GARMIN_CHAVE_CRIPTO.value());
});

/**
 * Envia os treinos planejados do período ao intervals.icu, que os repassa ao calendário do Garmin Connect (a próxima semana).
 * Usa a chave de API que o usuário guardou ao conectar.
 */
export const intervalsEnviarTreinos = onCall({ region: REGIAO, memory: "512MiB", timeoutSeconds: 120, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  const resultado = await servico.enviarPlano(uid, servico.validarPeriodo(lerObjeto(request.data)), GARMIN_CHAVE_CRIPTO.value());
  if (resultado.falhas > 0) {
    // fica registrado na central de notificações; o id inclui o instante para que cada tentativa com falha gere um aviso
    await criarNotificacao(uid, "envioFalhou", { falhas: resultado.falhas, referencia: String(Date.now()) }).catch((err) =>
      logger.error("Falha ao notificar o erro de envio", { uid, erro: String(err) }),
    );
  }
  return resultado;
});
