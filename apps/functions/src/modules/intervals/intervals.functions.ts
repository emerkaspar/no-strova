import { diaNoFuso, RECURSOS } from "@no-strova/domain";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGIAO } from "../../shared/config";
import { db } from "../../shared/firebase";
import { exigirAcesso, exigirRecurso, lerObjeto } from "../../shared/guards";
import { criarNotificacao, resolverNotificacoes } from "../notificacoes/notificacoes.service";
import { rodarAgenda } from "./intervals.agenda";
import * as servico from "./intervals.service";

/** Mesmo segredo que cifra a chave pessoal do Garmin (Secret Manager). Trocar o valor invalida as chaves já guardadas. */
const GARMIN_CHAVE_CRIPTO = defineSecret("GARMIN_CHAVE_CRIPTO");

// Conexão e sincronização de atividades do intervals.icu valem para qualquer usuário aprovado: o intervals.icu é o conector oficial
// do app e não depende do recurso "garmin". Só o envio de treinos ao Garmin (mais abaixo) continua atrás desse recurso.
export const intervalsSituacao = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  return servico.situacao(uid);
});

export const intervalsConectar = onCall({ region: REGIAO, secrets: [GARMIN_CHAVE_CRIPTO] }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const situacao = await servico.conectar(uid, lerObjeto(request.data).chave, GARMIN_CHAVE_CRIPTO.value());
  // reconectou: o aviso de "chave recusada" deixou de valer
  await resolverNotificacoes(uid, "intervalsChaveInvalida").catch((err) => logger.error("Falha ao resolver o aviso do intervals.icu", { uid, erro: String(err) }));
  return situacao;
});

export const intervalsDesconectar = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await servico.desconectar(uid);
  return { ok: true };
});

/** Traz as atividades do intervals.icu (inclusive as da IGPSPORT) em lotes; o app repete a chamada com `proximo` até `terminou`. */
export const intervalsSincronizarAtividades = onCall(
  { region: REGIAO, memory: "512MiB", timeoutSeconds: 300, secrets: [GARMIN_CHAVE_CRIPTO] },
  async (request) => {
    const { uid, perfil } = await exigirAcesso(request);
    const dataNascimento = typeof perfil.dataNascimento === "string" ? perfil.dataNascimento : null;
    return servico.sincronizarAtividades(uid, dataNascimento, lerObjeto(request.data), GARMIN_CHAVE_CRIPTO.value());
  },
);

/** Tempo máximo para começar usuários novos: a função tem 540 s, e o resto é folga para terminar o que estiver em andamento. */
const ORCAMENTO_DA_ROTINA_MS = 420_000;

/**
 * Todo dia às 05:00 (São Paulo): sincroniza as atividades de quem está com o intervals.icu conectado (`intervalsConexoes` com
 * status "ativa"). Quem o intervals.icu recusar vira "chaveInvalida" e recebe um aviso; o que não couber no tempo fica para o dia
 * seguinte. O botão "Sincronizar agora" do app faz o mesmo sob demanda.
 */
export const sincronizarIntervalsDiario = onSchedule(
  { schedule: "every day 05:00", timeZone: "America/Sao_Paulo", region: REGIAO, timeoutSeconds: 540, memory: "512MiB", secrets: [GARMIN_CHAVE_CRIPTO] },
  async () => {
    const segredo = GARMIN_CHAVE_CRIPTO.value();
    const resumo = await rodarAgenda(
      {
        async listar() {
          const snap = await db.collection("intervalsConexoes").where("status", "==", "ativa").get();
          return snap.docs.map((d) => {
            const ultima = d.get("ultimaTentativa");
            return { uid: d.id, ultimaTentativaMs: ultima instanceof Timestamp ? ultima.toMillis() : null };
          });
        },
        sincronizar: (uid) => servico.sincronizarUsuario(uid, segredo),
        marcarChaveInvalida: servico.marcarChaveInvalida,
        registrarFalha: servico.registrarFalhaDeSincronizacao,
        avisarChaveInvalida: async (uid) => {
          await criarNotificacao(uid, "intervalsChaveInvalida", { dia: diaNoFuso(Date.now()) });
        },
        agora: () => Date.now(),
      },
      ORCAMENTO_DA_ROTINA_MS,
    );
    logger.info("Sincronização diária do intervals.icu concluída", resumo);
  },
);

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
