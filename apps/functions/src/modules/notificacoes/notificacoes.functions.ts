import { HORA_TREINO_MANHA, HORA_TREINO_TARDE } from "@no-strova/domain";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGIAO } from "../../shared/config";
import { exigirAcesso } from "../../shared/guards";
import { avisosDeTreino, avisosDiarios } from "./lembretes.service";
import { registrarDispositivo, removerDispositivo } from "./push.service";
import { avisarAdminsDeNovoUsuario, marcarComoLidas, marcarTodasComoLidas, resolverNotificacoes } from "./notificacoes.service";

const FUSO = "America/Sao_Paulo";

/** Marca notificações como lidas. O cliente não escreve em `notificacoes`: só lê. */
export const marcarNotificacoesComoLidas = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const ids = Array.isArray(request.data?.ids) ? (request.data.ids as unknown[]).filter((v): v is string => typeof v === "string") : [];
  return { marcadas: await marcarComoLidas(uid, ids) };
});

/** Marca como lidas todas as pendentes do usuário. */
export const marcarTodasNotificacoesComoLidas = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return { marcadas: await marcarTodasComoLidas(uid) };
});

/** Registra o aparelho para receber push (o token vem do FCM no navegador). */
export const registrarDispositivoPush = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await registrarDispositivo(uid, request.data?.token, request.data?.plataforma);
  return { ok: true };
});

/** Remove o aparelho (o usuário desligou o push). */
export const removerDispositivoPush = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await removerDispositivo(uid, request.data?.token);
  return { ok: true };
});

/** Todo dia às 07:00 (São Paulo): treinos de hoje, treino de ontem sem registro e conflitos. */
export const avisarTreinosDaManha = onSchedule(
  { schedule: `every day ${String(HORA_TREINO_MANHA).padStart(2, "0")}:00`, timeZone: FUSO, region: REGIAO, timeoutSeconds: 300 },
  async () => avisosDeTreino("manha"),
);

/** Todo dia às 18:00 (São Paulo): relembra o treino de hoje que ainda não foi feito. */
export const avisarTreinosDaTarde = onSchedule(
  { schedule: `every day ${String(HORA_TREINO_TARDE).padStart(2, "0")}:00`, timeZone: FUSO, region: REGIAO, timeoutSeconds: 300 },
  async () => avisosDeTreino("tarde"),
);

/** Todo dia às 08:00 (São Paulo): pesagem, medidas, LTHR, provas, prazos de meta e validade da chave do Garmin. */
export const avisarRotinaDiaria = onSchedule(
  { schedule: "every day 08:00", timeZone: FUSO, region: REGIAO, timeoutSeconds: 540 },
  async () => avisosDiarios(),
);

/** Registrar uma pesagem dá o lembrete de pesagem por resolvido (continua na lista até ser lido). */
export const resolverAvisoDePesagem = onDocumentWritten({ document: "pesagens/{id}", region: REGIAO }, async (event) => {
  const uid = event.data?.after.data()?.userId;
  if (typeof uid === "string") await resolverNotificacoes(uid, "pesar");
});

/** Registrar medidas dá o lembrete de medidas por resolvido. */
export const resolverAvisoDeMedidas = onDocumentWritten({ document: "medidas/{id}", region: REGIAO }, async (event) => {
  const uid = event.data?.after.data()?.userId;
  if (typeof uid === "string") await resolverNotificacoes(uid, "medidas");
});

/** Nova configuração do atleta (inclui o LTHR) dá o lembrete de teste de LTHR por resolvido. */
export const resolverAvisoDeLthr = onDocumentWritten({ document: "configsAtleta/{id}", region: REGIAO }, async (event) => {
  const uid = event.data?.after.data()?.userId;
  if (typeof uid === "string") await resolverNotificacoes(uid, "testeLthr");
});

/** Quando alguém conclui o cadastro (aceite LGPD) e ainda não está aprovado, avisa os administradores. */
export const avisarNovoUsuarioPendente = onDocumentWritten({ document: "users/{uid}", region: REGIAO }, async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  if (!depois || depois.aprovado !== false || depois.ativo !== true) return;
  if (!depois.aceiteLgpd?.versao || antes?.aceiteLgpd?.versao) return;
  try {
    await avisarAdminsDeNovoUsuario(event.params.uid, String(depois.nome ?? ""));
  } catch (err) {
    logger.error("Falha ao avisar os administradores do novo usuário", err);
  }
});
