import { RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import * as servico from "./strava.service";

/**
 * Segredos no Secret Manager (`firebase functions:secrets:set <NOME>`):
 * - STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET: o ID e o segredo do app, na página "Meu aplicativo API" do Strava;
 * - GARMIN_CHAVE_CRIPTO: a mesma chave que já cifra as chaves do Garmin; aqui cifra os tokens do Strava.
 */
const STRAVA_CLIENT_ID = defineSecret("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");
const GARMIN_CHAVE_CRIPTO = defineSecret("GARMIN_CHAVE_CRIPTO");
const secrets = [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, GARMIN_CHAVE_CRIPTO];

function segredos(): servico.SegredosStrava {
  return { clientId: STRAVA_CLIENT_ID.value().trim(), clientSecret: STRAVA_CLIENT_SECRET.value().trim(), cripto: GARMIN_CHAVE_CRIPTO.value() };
}

export const stravaSituacao = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.STRAVA);
  return servico.situacao(uid);
});

export const stravaConectar = onCall({ region: REGIAO, secrets }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.STRAVA);
  const dados = lerObjeto(request.data);
  return servico.conectar(uid, dados.codigo, dados.escopo, segredos());
});

export const stravaDesconectar = onCall({ region: REGIAO, secrets }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await servico.desconectar(uid, segredos());
  return { ok: true };
});

/** Processa um lote; o app repete a chamada com `proximo` até `terminou`. */
export const stravaSincronizar = onCall({ region: REGIAO, memory: "512MiB", timeoutSeconds: 300, secrets }, async (request) => {
  const { uid, perfil } = await exigirRecurso(request, RECURSOS.STRAVA);
  const dataNascimento = typeof perfil.dataNascimento === "string" ? perfil.dataNascimento : null;
  return servico.sincronizarLote(uid, dataNascimento, lerObjeto(request.data), segredos());
});
