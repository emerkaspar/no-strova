import { RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import { chamadasRestantes, decidirRascunhoDoUsuario, sugerirPlanoAnualDoUsuario, sugerirTreinosDoUsuario } from "./ia.service";

/** Chave da API do Gemini no Secret Manager: `firebase functions:secrets:set GEMINI_API_KEY`. */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const opcoes = { region: REGIAO, timeoutSeconds: 120, memory: "512MiB" as const, secrets: [GEMINI_API_KEY] };

function chave(): string {
  const valor = GEMINI_API_KEY.value();
  if (!valor) throw new HttpsError("failed-precondition", "A IA ainda não está configurada (chave do Gemini ausente).");
  return valor;
}

/** Sugere treinos do catálogo para as próximas semanas, como rascunho. Cota: 5 chamadas de IA por dia. */
export const sugerirTreinos = onCall(opcoes, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  return sugerirTreinosDoUsuario(uid, lerObjeto(request.data), chave());
});

/** Rascunho do plano anual com IA: escolhe treinos para as próximas semanas, o código confere as regras. Cota: 1 chamada de IA. */
export const sugerirPlanoAnual = onCall(opcoes, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  return sugerirPlanoAnualDoUsuario(uid, lerObjeto(request.data), chave());
});

/** Marca um rascunho como aceito ou descartado (o app grava o plano ou a meta pelos caminhos já validados). */
export const decidirRascunho = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const dados = lerObjeto(request.data);
  return decidirRascunhoDoUsuario(uid, dados.rascunhoId, dados.decisao);
});

/** Quantas sugestões de IA ainda restam hoje. */
export const iaChamadasRestantes = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  return { restantes: await chamadasRestantes(uid) };
});
