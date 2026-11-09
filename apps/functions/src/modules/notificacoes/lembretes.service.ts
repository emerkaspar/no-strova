import {
  diaNoFuso,
  lembretePeriodicoVencido,
  MARCOS_GARMIN_DIAS,
  MARCOS_META_DIAS,
  MARCOS_PROVA_DIAS,
  marcoAtingido,
  somarDias,
} from "@no-strova/domain";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "../../shared/firebase";
import { criarNotificacao, lerPreferenciasNotificacao } from "./notificacoes.service";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Usuários com acesso liberado: são os únicos que recebem notificações. */
async function usuariosAtivos(): Promise<string[]> {
  const snap = await db.collection("users").where("aprovado", "==", true).where("ativo", "==", true).get();
  return snap.docs.map((d) => d.id);
}

/** Roda a rotina de cada usuário isolando falhas: um usuário com dado ruim não derruba os demais. */
async function paraCadaUsuario(nome: string, rotina: (uid: string) => Promise<number>): Promise<void> {
  let criadas = 0;
  let falhas = 0;
  for (const uid of await usuariosAtivos()) {
    try {
      criadas += await rotina(uid);
    } catch (err) {
      falhas += 1;
      logger.error(`Falha na rotina de notificações (${nome})`, { uid, erro: String(err) });
    }
  }
  logger.info(`Rotina de notificações concluída (${nome})`, { criadas, falhas });
}

function contar(...resultados: boolean[]): number {
  return resultados.filter(Boolean).length;
}

/**
 * Treino do dia. De manhã avisa dos treinos planejados de hoje, do treino de ontem que ficou sem registro e de treinos
 * conflitantes (mais de um do mesmo esporte no dia). À tarde só relembra se nenhuma atividade foi importada hoje.
 */
export async function avisosDeTreino(periodo: "manha" | "tarde"): Promise<void> {
  const hoje = diaNoFuso(Date.now());
  const ontem = somarDias(hoje, -1);
  await paraCadaUsuario(`treino-${periodo}`, async (uid) => {
    const prefs = await lerPreferenciasNotificacao(uid);
    const planejados = (await db.collection("treinosPlanejados").where("userId", "==", uid).where("data", "==", hoje).get()).docs
      .map((d) => d.data() as { status?: string; esporte?: string; nomeTreino?: string })
      .filter((t) => t.status === "planejado");
    if (planejados.length === 0 && periodo === "tarde") return 0;

    if (periodo === "tarde") {
      const feitas = await db.collection("atividades").where("userId", "==", uid).where("data", "==", hoje).limit(1).get();
      if (!feitas.empty) return 0;
      return contar(await criarNotificacao(uid, "treinoHoje", { data: hoje, quantidade: planejados.length, periodo }, prefs));
    }

    let criadas = 0;
    if (planejados.length > 0) {
      const resumo = planejados.map((t) => t.nomeTreino || t.esporte).filter(Boolean).join(", ");
      criadas += contar(await criarNotificacao(uid, "treinoHoje", { data: hoje, quantidade: planejados.length, periodo, resumo }, prefs));
      const porEsporte = new Map<string, number>();
      for (const t of planejados) porEsporte.set(String(t.esporte), (porEsporte.get(String(t.esporte)) ?? 0) + 1);
      const conflito = Math.max(0, ...porEsporte.values());
      if (conflito > 1) criadas += contar(await criarNotificacao(uid, "conflitoTreinos", { data: hoje, quantidade: conflito }, prefs));
    }
    const ontemPendente = (await db.collection("treinosPlanejados").where("userId", "==", uid).where("data", "==", ontem).get()).docs.some(
      (d) => d.get("status") === "planejado",
    );
    if (ontemPendente) criadas += contar(await criarNotificacao(uid, "treinoOntem", { data: ontem }, prefs));
    return criadas;
  });
}

/** Maior valor de `campo` (yyyy-mm-dd) entre os documentos, ou `null`. */
function maiorData(docs: FirebaseFirestore.QueryDocumentSnapshot[], campo: string): string | null {
  let maior: string | null = null;
  for (const d of docs) {
    const v = d.get(campo);
    if (typeof v === "string" && (maior === null || v > maior)) maior = v;
  }
  return maior;
}

async function ultimaData(colecao: string, uid: string): Promise<string | null> {
  const snap = await db.collection(colecao).where("userId", "==", uid).orderBy("data", "desc").limit(1).get();
  return snap.empty ? null : (snap.docs[0].get("data") as string);
}

/** Rotina diária: pesagem, medidas, LTHR, provas, prazos de meta e validade da chave do Garmin. */
export async function avisosDiarios(): Promise<void> {
  const hoje = diaNoFuso(Date.now());
  await paraCadaUsuario("diario", async (uid) => {
    const prefs = await lerPreferenciasNotificacao(uid);
    let criadas = 0;

    const pesagem = lembretePeriodicoVencido({ ultimaData: await ultimaData("pesagens", uid), hoje, intervaloDias: prefs.intervaloPesoDias });
    if (pesagem) criadas += contar(await criarNotificacao(uid, "pesar", pesagem, prefs));

    const medidas = lembretePeriodicoVencido({ ultimaData: await ultimaData("medidas", uid), hoje, intervaloDias: prefs.intervaloMedidasDias });
    if (medidas) criadas += contar(await criarNotificacao(uid, "medidas", medidas, prefs));

    // LTHR: só cobra de quem já tem configuração. Vale o teste mais recente, ou a vigência mais recente da configuração.
    const configs = (await db.collection("configsAtleta").where("userId", "==", uid).get()).docs;
    if (configs.length > 0) {
      const testes = (await db.collection("atividades").where("userId", "==", uid).where("testeLthr", "==", true).get()).docs;
      const ultima = [maiorData(testes, "data"), maiorData(configs, "vigenteDesde")].filter((v): v is string => v !== null).sort().pop() ?? null;
      const lthr = lembretePeriodicoVencido({ ultimaData: ultima, hoje, intervaloDias: prefs.intervaloLthrSemanas * 7 });
      if (lthr) criadas += contar(await criarNotificacao(uid, "testeLthr", lthr, prefs));
    }

    for (const prova of (await db.collection("provas").where("userId", "==", uid).where("data", ">=", hoje).get()).docs) {
      const dados = prova.data() as { nome?: string; data: string; local?: string };
      const dias = marcoAtingido(dados.data, hoje, [...MARCOS_PROVA_DIAS, 0]);
      if (dias === null) continue;
      criadas += contar(await criarNotificacao(uid, "provaChegando", { provaId: prova.id, nome: dados.nome ?? "Sua prova", data: dados.data, local: dados.local, dias }, prefs));
    }

    const metas: Array<{ id: string; dataAlvo?: string; rotuloMeta: string }> = [
      ...(await db.collection("metasPeso").where("userId", "==", uid).where("status", "==", "ativa").get()).docs.map((d) => ({
        id: d.id,
        dataAlvo: d.get("dataAlvo") as string | undefined,
        rotuloMeta: "Sua meta de peso",
      })),
      ...(await db.collection("metasCondicionamento").where("userId", "==", uid).where("ativa", "==", true).get()).docs.map((d) => ({
        id: d.id,
        dataAlvo: d.get("dataAlvo") as string | undefined,
        rotuloMeta: "Sua meta de condicionamento",
      })),
    ];
    for (const meta of metas) {
      if (typeof meta.dataAlvo !== "string") continue;
      const dias = marcoAtingido(meta.dataAlvo, hoje, MARCOS_META_DIAS);
      if (dias === null) continue;
      criadas += contar(await criarNotificacao(uid, "prazoMeta", { metaId: meta.id, dataAlvo: meta.dataAlvo, rotuloMeta: meta.rotuloMeta, dias }, prefs));
    }

    const garmin = (await db.doc(`users/${uid}/segredos/garmin`).get()).get("expiraEm");
    if (garmin instanceof Timestamp) {
      const dias = Math.max(0, Math.ceil((garmin.toMillis() - Date.now()) / DIA_MS));
      if (dias === 0 || (MARCOS_GARMIN_DIAS as readonly number[]).includes(dias)) {
        criadas += contar(await criarNotificacao(uid, "garminExpirando", { dias, expiraEm: garmin.toDate().toISOString().slice(0, 10) }, prefs));
      }
    }
    return criadas;
  });
}
