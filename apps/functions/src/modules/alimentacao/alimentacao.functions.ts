import { RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirRecurso, lerObjeto } from "../../shared/guards";
import { sugerirAlimentacaoDoUsuario } from "./alimentacao.service";

/** Mesma chave do Gemini usada pelas sugestões de treino (`firebase functions:secrets:set GEMINI_API_KEY`). */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

/**
 * Lanches (para levar e da padaria) e receitas em casa para o dia ou a semana, pelo treino, pelo condicionamento e pelo perfil
 * alimentar. Cota: 1 chamada de IA (a mesma dos treinos).
 */
export const sugerirAlimentacao = onCall({ region: REGIAO, timeoutSeconds: 120, memory: "512MiB", secrets: [GEMINI_API_KEY] }, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  const chave = GEMINI_API_KEY.value();
  if (!chave) throw new HttpsError("failed-precondition", "A IA ainda não está configurada (chave do Gemini ausente).");
  return sugerirAlimentacaoDoUsuario(uid, lerObjeto(request.data), chave);
});
