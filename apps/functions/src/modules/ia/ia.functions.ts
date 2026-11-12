import { DIA_DA_SEMANA_IA, HORA_SEMANA_IA, RECURSOS } from "@no-strova/domain";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import { gerarSemanasAutomaticas } from "./semanaAutomatica.service";
import { chamadasRestantes, decidirRascunhoDoUsuario, sugerirPlanoAnualDoUsuario, sugerirTreinoDoTrajetoDoUsuario, sugerirTreinoUnicoDoUsuario, sugerirTreinosDoUsuario } from "./ia.service";

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

/** Sugere um único treino para um dia (botão "+" do calendário), pela carga e pelo sentimento recente. Cota: 1 chamada de IA. */
export const sugerirTreinoUnico = onCall(opcoes, async (request) => {
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  return sugerirTreinoUnicoDoUsuario(uid, lerObjeto(request.data), chave());
});

/**
 * Treino por tempo adaptado à altimetria de um trajeto (esforço nas subidas, nas descidas ou equilibrado). A IA escolhe a
 * intensidade de cada trecho; sem IA (`usarIa: false`) valem as regras da estratégia. Não grava nada. Cota: 1 chamada de IA, só quando usa a IA.
 */
export const sugerirTreinoDoTrajeto = onCall(opcoes, async (request) => {
  const dados = lerObjeto(request.data);
  // "Zerar o trajeto" não usa IA: basta o acesso liberado, sem cota e sem chave do Gemini
  if (dados.estrategia === "recorde") {
    const { uid } = await exigirAcesso(request);
    return sugerirTreinoDoTrajetoDoUsuario(uid, dados, null);
  }
  const { uid } = await exigirRecurso(request, RECURSOS.IA);
  return sugerirTreinoDoTrajetoDoUsuario(uid, dados, dados.usarIa === false ? null : chave());
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

/**
 * Domingo às 20h (São Paulo): monta a semana seguinte com IA para quem ligou "gerar com IA" no Perfil de treino, grava os
 * treinos no plano e avisa por push. Não gasta a cota diária do usuário.
 */
export const gerarSemanaComIa = onSchedule(
  { schedule: `every ${DIA_DA_SEMANA_IA === 6 ? "sunday" : "monday"} ${String(HORA_SEMANA_IA).padStart(2, "0")}:00`, timeZone: "America/Sao_Paulo", region: REGIAO, timeoutSeconds: 540, memory: "512MiB", secrets: [GEMINI_API_KEY] },
  async () => gerarSemanasAutomaticas(chave()),
);
