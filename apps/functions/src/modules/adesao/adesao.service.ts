import { resumirAdesao } from "@no-strova/domain";
import type { Timestamp } from "firebase-admin/firestore";
import { auth, db } from "../../shared/firebase";
import { listarTodosUsuarios } from "../auth/auth.service";
import type { LinhaAdesao } from "./adesao.types";

/** Usuários processados ao mesmo tempo, para não estourar as cotas do Firestore. */
const CONCORRENCIA = 10;

const ms = (valor: unknown): number | null =>
  valor && typeof (valor as Timestamp).toMillis === "function" ? (valor as Timestamp).toMillis() : null;

async function emLotes<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += CONCORRENCIA) {
    saida.push(...(await Promise.all(itens.slice(i, i + CONCORRENCIA).map(fn))));
  }
  return saida;
}

/** Último acesso por uid, a partir do Auth (maior entre login e renovação de sessão). */
async function ultimosAcessos(uids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) {
      const tempos = [u.metadata.lastSignInTime, u.metadata.lastRefreshTime]
        .map((t) => (t ? Date.parse(t) : NaN))
        .filter((t) => Number.isFinite(t));
      if (tempos.length > 0) mapa.set(u.uid, Math.max(...tempos));
    }
  }
  return mapa;
}

async function contar(consulta: FirebaseFirestore.Query): Promise<number> {
  return (await consulta.count().get()).data().count;
}

async function dadosDeAtividade(uid: string): Promise<Pick<LinhaAdesao, "atividades" | "treinosPlanejados">> {
  const atividades = db.collection("atividades").where("userId", "==", uid);
  const planejados = db.collection("treinosPlanejados").where("userId", "==", uid);
  const [total, garmin, intervals, manual, ultima, totalPlanejados, porIa] = await Promise.all([
    contar(atividades),
    contar(atividades.where("fonte", "==", "garmin")),
    contar(atividades.where("fonte", "==", "intervals")),
    contar(atividades.where("origem", "==", "manual")),
    atividades.orderBy("criadoEm", "desc").limit(1).get(),
    contar(planejados),
    contar(planejados.where("geradoPorIa", "==", true)),
  ]);
  return {
    atividades: { total, ultimaEm: ms(ultima.docs[0]?.get("criadoEm")), porFonte: { garmin, intervals, manual } },
    treinosPlanejados: { total: totalPlanejados, porIa },
  };
}

/**
 * Monta o painel de adesão: uma linha por usuário e o resumo geral. Roda só para admin e devolve apenas
 * booleanos, datas e contagens; as chaves cifradas e os dados de saúde nunca saem daqui.
 */
export async function montarPainelAdesao(agora = Date.now()) {
  const usuarios = await listarTodosUsuarios();
  const uids = usuarios.map((u) => u.uid);

  const [acessos, conexoesIntervals, segredosGarmin, preferencias] = await Promise.all([
    ultimosAcessos(uids),
    db.collection("intervalsConexoes").get(),
    uids.length > 0 ? db.getAll(...uids.map((uid) => db.doc(`users/${uid}/segredos/garmin`))) : [],
    uids.length > 0 ? db.getAll(...uids.map((uid) => db.doc(`preferencias/${uid}`))) : [],
  ]);

  const intervalsPorUid = new Map(conexoesIntervals.docs.map((d) => [d.id, d]));
  const garminPorUid = new Map(segredosGarmin.map((d) => [d.ref.parent.parent?.id ?? "", d]));
  const prefsPorUid = new Map(preferencias.map((d) => [d.id, d]));

  const linhas: LinhaAdesao[] = await emLotes(usuarios, async (u) => {
    const [uso, dispositivos] = await Promise.all([
      dadosDeAtividade(u.uid),
      db.collection(`users/${u.uid}/dispositivos`).limit(1).get(),
    ]);
    const conexao = intervalsPorUid.get(u.uid);
    const garmin = garminPorUid.get(u.uid);
    const garminConectado = !!garmin?.exists && typeof garmin.get("chaveCifrada") === "string";
    const onboarding = prefsPorUid.get(u.uid)?.get("onboarding");

    return {
      uid: u.uid,
      nome: u.nome,
      email: u.email,
      role: u.role,
      aprovado: u.aprovado,
      ativo: u.ativo,
      criadoEm: u.criadoEm,
      ultimoAcesso: acessos.get(u.uid) ?? null,
      onboarding: typeof onboarding === "string" ? onboarding : null,
      intervals: conexao
        ? {
            status: typeof conexao.get("status") === "string" ? (conexao.get("status") as string) : null,
            conectadaEm: ms(conexao.get("conectadaEm")),
            ultimaSincronizacao: ms(conexao.get("ultimaSincronizacao")),
            falhasSeguidas: Number(conexao.get("falhasSeguidas") ?? 0),
          }
        : null,
      garmin: garminConectado
        ? { conectado: true, expiraEm: ms(garmin?.get("expiraEm")), ultimaSincronizacao: ms(garmin?.get("ultimaSincronizacao")) }
        : null,
      ...uso,
      push: !dispositivos.empty,
    };
  });

  return { geradoEm: agora, resumo: resumirAdesao(linhas, agora), usuarios: linhas };
}
