import { diaNoFuso, diasEntre, idNotificacao, montarNotificacao, normalizarPreferenciasNotificacao, tipoComPush, tipoLigado } from "@no-strova/domain";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "../../shared/firebase";
import { enviarPush } from "./push.service";

type Ctx = Record<string, unknown>;

/** Preferências de notificação do usuário (padrões quando nunca configurou). */
export async function lerPreferenciasNotificacao(uid: string) {
  const snap = await db.doc(`preferencias/${uid}`).get();
  return normalizarPreferenciasNotificacao(snap.data()?.notificacoes);
}

/**
 * Cria a notificação se o tipo estiver ligado e se ela ainda não existir. O id é determinístico
 * (`<uid>_<tipo>_<referência>`), então retentativa de trigger e reexecução do job nunca duplicam: o `create` falha com
 * "já existe" (código 6) e isso é esperado. Uma notificação já lida nunca volta a ficar não lida.
 * @returns `true` quando criou uma nova.
 */
export async function criarNotificacao(uid: string, tipo: string, ctx: Ctx, preferencias?: unknown): Promise<boolean> {
  const prefs = preferencias ?? (await lerPreferenciasNotificacao(uid));
  if (!tipoLigado(prefs, tipo)) return false;
  const conteudo = montarNotificacao(tipo, ctx);
  if (!conteudo) return false;
  const id = idNotificacao(uid, tipo, conteudo.referencia);
  try {
    await db.doc(`notificacoes/${id}`).create({
      userId: uid,
      tipo: conteudo.tipo,
      grupo: conteudo.grupo,
      titulo: conteudo.titulo,
      mensagem: conteudo.mensagem,
      rota: conteudo.rota,
      referencia: conteudo.referencia,
      criadoEm: FieldValue.serverTimestamp(),
      lida: false,
      lidaEm: null,
      resolvida: false,
      resolvidaEm: null,
    });
    // o push é um efeito colateral: se falhar, o aviso já está na central e nada deve quebrar
    if (tipoComPush(prefs, tipo)) {
      await enviarPush(uid, { id, titulo: conteudo.titulo, mensagem: conteudo.mensagem, rota: conteudo.rota }).catch((err) =>
        logger.error("Falha ao enviar push", { uid, tipo, erro: String(err) }),
      );
    }
    return true;
  } catch (err) {
    if ((err as { code?: number }).code !== 6) logger.error("Falha ao criar notificação", { uid, tipo, erro: String(err) });
    return false;
  }
}

/**
 * Marca como resolvidas as notificações do tipo em que a condição deixou de valer (ex.: o usuário se pesou). Elas
 * continuam na lista até serem lidas: só ganham o selo "Resolvido". Filtra em memória para não exigir índice composto.
 */
export async function resolverNotificacoes(uid: string, tipo: string, filtro?: (referencia: string) => boolean): Promise<number> {
  const snap = await db.collection("notificacoes").where("userId", "==", uid).where("tipo", "==", tipo).where("resolvida", "==", false).get();
  const alvo = snap.docs.filter((d) => !filtro || filtro(String(d.get("referencia") ?? "")));
  if (alvo.length === 0) return 0;
  const lote = db.batch();
  for (const d of alvo) lote.update(d.ref, { resolvida: true, resolvidaEm: FieldValue.serverTimestamp() });
  await lote.commit();
  return alvo.length;
}

const ID_VALIDO = /^[A-Za-z0-9_-]{8,160}$/;

/** Marca notificações do usuário como lidas. Ignora ids que não são dele. */
export async function marcarComoLidas(uid: string, ids: string[]): Promise<number> {
  const lote = db.batch();
  let n = 0;
  for (const id of ids.slice(0, 100)) {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) continue;
    const ref = db.doc(`notificacoes/${id}`);
    const snap = await ref.get();
    if (snap.exists && snap.get("userId") === uid && snap.get("lida") !== true) {
      lote.update(ref, { lida: true, lidaEm: FieldValue.serverTimestamp() });
      n += 1;
    }
  }
  if (n > 0) await lote.commit();
  return n;
}

/** Marca como lidas todas as pendentes do usuário (em lotes de até 400). */
export async function marcarTodasComoLidas(uid: string): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await db.collection("notificacoes").where("userId", "==", uid).where("lida", "==", false).limit(400).get();
    if (snap.empty) return total;
    const lote = db.batch();
    for (const d of snap.docs) lote.update(d.ref, { lida: true, lidaEm: FieldValue.serverTimestamp() });
    await lote.commit();
    total += snap.size;
    if (snap.size < 400) return total;
  }
}

/**
 * Reage à gravação de uma atividade: pede o "Como foi?" enquanto não houver feedback, dá o treino do dia por
 * resolvido quando a atividade é do próprio dia e resolve o lembrete de LTHR quando a atividade é um teste.
 * Notificação não some sozinha: resolver só põe o selo "Resolvido" (ela sai da lista quando o usuário a marca como lida).
 */
export async function reagirAAtividade(
  uid: string,
  atividadeId: string,
  antes: FirebaseFirestore.DocumentData | undefined,
  depois: FirebaseFirestore.DocumentData | undefined,
): Promise<void> {
  if (!depois) return;
  const nova = !antes;
  if (depois.feedback) {
    await resolverNotificacoes(uid, "comoFoi", (ref) => ref === atividadeId);
  } else if (nova && typeof depois.data === "string" && diasEntre(depois.data, diaNoFuso(Date.now())) <= 3) {
    // importação em massa do histórico não pode gerar uma enxurrada de "Como foi?": só atividades dos últimos 3 dias
    await criarNotificacao(uid, "comoFoi", { atividadeId, data: depois.data });
  }
  if (nova && typeof depois.data === "string") {
    const dia = depois.data;
    await resolverNotificacoes(uid, "treinoHoje", (ref) => ref.startsWith(dia));
  }
  if (depois.testeLthr === true && antes?.testeLthr !== true) await resolverNotificacoes(uid, "testeLthr");
}

/** Avisa os administradores de que alguém concluiu o cadastro e aguarda aprovação. */
export async function avisarAdminsDeNovoUsuario(novoUid: string, nome: string): Promise<number> {
  const admins = await db.collection("users").where("role", "==", "admin").where("aprovado", "==", true).where("ativo", "==", true).get();
  let criadas = 0;
  for (const admin of admins.docs) {
    if (await criarNotificacao(admin.id, "aguardandoAprovacao", { novoUid, nome })) criadas += 1;
  }
  return criadas;
}
