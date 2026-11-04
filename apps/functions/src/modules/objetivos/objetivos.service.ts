import { avaliarObjetivo, calcularSerieForma, diaNoFuso, idDaConquista, instanciasDaMeta, validarMetaDeProgressao } from "@no-strova/domain";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "../../shared/firebase";

/**
 * Concede a badge de cada objetivo atingido que ainda não tem conquista. Metas de semana e de mês são recorrentes: cada
 * semana (ou mês) atingida rende a sua badge; a meta do ano rende uma por ano. A conquista tem id `<meta>_<período>`, então
 * reexecutar (retentativa do trigger) nunca duplica nada, e ela continua valendo mesmo que a atividade seja apagada depois.
 * Quem grava é só o servidor: as regras negam escrita ao cliente.
 *
 * `notificadaEm` fica nulo de propósito: é o ponto de partida da futura notificação de objetivo concluído.
 * @returns quantidade de conquistas novas
 */
export async function concederConquistasDoUsuario(uid: string): Promise<number> {
  const metasSnap = await db.collection("metasProgressao").where("userId", "==", uid).get();
  if (metasSnap.empty) return 0;

  const existentes = new Set((await db.collection("conquistas").where("userId", "==", uid).get()).docs.map((d) => d.id));
  const hoje = diaNoFuso(Date.now());

  type Meta = NonNullable<ReturnType<typeof validarMetaDeProgressao>["valores"]> & { id: string; ate: string | null };
  const pendentes: Array<{ meta: Meta; periodo: ReturnType<typeof instanciasDaMeta>[number]; id: string }> = [];
  for (const doc of metasSnap.docs) {
    const dados = doc.data();
    const r = validarMetaDeProgressao(dados);
    if (!r.valido || !r.valores) continue;
    // a data de início já vem normalizada (1º do ano, 1º do mês ou segunda-feira)
    const meta: Meta = { ...r.valores, id: doc.id, ate: typeof dados.ate === "string" ? dados.ate : null };
    for (const periodo of instanciasDaMeta(meta, hoje)) {
      const id = idDaConquista(doc.id, periodo);
      if (!existentes.has(id)) pendentes.push({ meta, periodo, id });
    }
  }
  if (pendentes.length === 0) return 0;

  const desde = pendentes.map((p) => p.periodo.inicio).sort()[0];
  const atividades = (await db.collection("atividades").where("userId", "==", uid).where("data", ">=", desde).get()).docs.map((d) => d.data() as { data: string; esporte: string });
  let condicionamentoPorData = new Map<string, number>();
  if (pendentes.some((p) => p.meta.tipo === "condicionamento")) {
    const dias = (await db.collection("estresseDiario").where("userId", "==", uid).get()).docs.map((d) => d.data() as { data: string; estresse: number });
    condicionamentoPorData = new Map(calcularSerieForma(dias, { ate: hoje }).map((d: { data: string; fitness: number }) => [d.data, d.fitness]));
  }

  let novas = 0;
  for (const { meta, periodo, id } of pendentes) {
    const r = avaliarObjetivo({ meta, periodo, atividades, condicionamentoPorData, hoje });
    if (r.estado !== "atingido" || !r.atingidaEm) continue;
    try {
      await db.doc(`conquistas/${id}`).create({
        userId: uid,
        metaId: meta.id,
        periodo: meta.periodo,
        inicio: periodo.inicio, // primeiro dia da semana, do mês ou do ano que foi atingido
        recorrente: meta.periodo !== "ano",
        metrica: meta.tipo,
        valorAlvo: meta.valorAlvo,
        esportes: meta.esportes,
        valorAtingido: Math.round((r.valorAtingido ?? meta.valorAlvo) * 100) / 100,
        atingidaEm: r.atingidaEm,
        criadoEm: FieldValue.serverTimestamp(),
        vista: false,
        notificadaEm: null,
      });
      novas += 1;
    } catch (err) {
      // já existia (corrida entre duas execuções): nada a fazer
      if ((err as { code?: number }).code !== 6) logger.error("Falha ao conceder conquista", { uid, conquista: id, erro: String(err) });
    }
  }
  return novas;
}

/** Marca conquistas do usuário como vistas (some o selo "Nova"). Ignora ids que não são dele. */
export async function marcarConquistasVistas(uid: string, ids: string[]): Promise<number> {
  const lote = db.batch();
  let n = 0;
  for (const id of ids.slice(0, 50)) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) continue;
    const ref = db.doc(`conquistas/${id}`);
    const snap = await ref.get();
    if (snap.exists && snap.get("userId") === uid && snap.get("vista") !== true) {
      lote.update(ref, { vista: true });
      n += 1;
    }
  }
  if (n > 0) await lote.commit();
  return n;
}
