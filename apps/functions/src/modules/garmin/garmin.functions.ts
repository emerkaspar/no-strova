import { RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import { enviarPlano, informarCodigo, validarEntrada } from "./garmin.envio.service";
import * as servico from "./garmin.service";

/**
 * Chave de criptografia das chaves pessoais do Garmin (Secret Manager):
 * `firebase functions:secrets:set GARMIN_CHAVE_CRIPTO` com um texto aleatório longo (ex.: 48 caracteres).
 * Trocar o valor invalida as chaves já guardadas; os usuários precisam conectar de novo.
 */
const GARMIN_CHAVE_CRIPTO = defineSecret("GARMIN_CHAVE_CRIPTO");

export const garminSituacao = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return servico.situacao(uid);
});

export const garminConectar = onCall({ region: REGIAO, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  const dados = lerObjeto(request.data);
  return servico.conectar(uid, dados.chave, dados.validadeDias, GARMIN_CHAVE_CRIPTO.value());
});

export const garminDesconectar = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await servico.desconectar(uid);
  return { ok: true };
});

/** Processa um lote; o app repete a chamada com `proximo` até `terminou`. */
export const garminSincronizar = onCall(
  { region: REGIAO, memory: "512MiB", timeoutSeconds: 300, secrets: [GARMIN_CHAVE_CRIPTO] },
  async (request) => {
    const { uid, perfil } = await exigirRecurso(request, RECURSOS.GARMIN);
    const dataNascimento = typeof perfil.dataNascimento === "string" ? perfil.dataNascimento : null;
    return servico.sincronizarLote(uid, dataNascimento, lerObjeto(request.data), GARMIN_CHAVE_CRIPTO.value());
  },
);

/**
 * Cria os treinos planejados do período no Garmin Connect e os agenda no calendário. O usuário informa o e-mail e a senha do
 * Garmin a cada envio: a senha é usada só nesta chamada (nunca gravada). Com duas etapas, o app pede o código e o devolve por
 * `garminInformarCodigo` enquanto esta chamada espera. Usa uma biblioteca não oficial, que pode parar de funcionar.
 */
export const garminEnviarTreinos = onCall({ region: REGIAO, memory: "512MiB", timeoutSeconds: 300 }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  return enviarPlano(uid, validarEntrada(lerObjeto(request.data)));
});

export const garminInformarCodigo = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.GARMIN);
  await informarCodigo(uid, lerObjeto(request.data).codigo);
  return { ok: true };
});
