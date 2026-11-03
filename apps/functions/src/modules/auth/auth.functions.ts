import * as functionsV1 from "firebase-functions/v1";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAdmin, exigirLogin, lerObjeto } from "../../shared/guards";
import {
  completarPerfil,
  criarPerfilInicial,
  definirAprovacao,
  definirAtivo,
  listarUsuariosPendentes,
} from "./auth.service";

// Triggers de criação de usuário no Auth só existem na v1 (a v2 exige Identity Platform).
export const bootstrapUserOnCreate = functionsV1
  .region(REGIAO)
  .auth.user()
  .onCreate(async (user) => {
    await criarPerfilInicial(user.uid, user.email ?? "");
  });

export const ensureUserProfile = onCall({ region: REGIAO }, async (request) => {
  const uid = exigirLogin(request);
  const dados = lerObjeto(request.data);
  const email = typeof request.auth?.token.email === "string" ? request.auth.token.email : "";
  return completarPerfil(uid, email, {
    nome: dados.nome,
    dataNascimento: dados.dataNascimento,
    aceiteLgpd: dados.aceiteLgpd,
  });
});

export const listarPendentes = onCall({ region: REGIAO }, async (request) => {
  await exigirAdmin(request);
  return { usuarios: await listarUsuariosPendentes() };
});

function lerUidEBooleano(data: unknown, campo: string): { uid: string; valor: boolean } {
  const dados = lerObjeto(data);
  const uid = dados.uid;
  const valor = dados[campo];
  if (typeof uid !== "string" || uid.length === 0 || uid.length > 128 || typeof valor !== "boolean") {
    throw new HttpsError("invalid-argument", "Dados da requisição inválidos.");
  }
  return { uid, valor };
}

export const aprovarUsuario = onCall({ region: REGIAO }, async (request) => {
  await exigirAdmin(request);
  const { uid, valor } = lerUidEBooleano(request.data, "aprovado");
  await definirAprovacao(uid, valor);
  return { ok: true };
});

export const bloquearUsuario = onCall({ region: REGIAO }, async (request) => {
  const adminUid = await exigirAdmin(request);
  const { uid, valor } = lerUidEBooleano(request.data, "ativo");
  if (uid === adminUid) {
    throw new HttpsError("failed-precondition", "Você não pode bloquear a própria conta.");
  }
  await definirAtivo(uid, valor);
  return { ok: true };
});
