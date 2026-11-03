import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../shared/firebase";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

type DadosAtividade = { hrss?: number | null; calorias?: number | null };

/** Id determinístico: um documento por usuário e dia. */
export function idEstresseDiario(uid: string, data: string): string {
  return `${uid}_${data.replaceAll("-", "")}`;
}

interface Agregado {
  estresse: number;
  kcal: number;
  qtdAtividades: number;
}

/** Soma o estresse (HRSS) e as calorias das atividades de um dia. Atividade sem HRSS conta na quantidade, com 0. */
export function agregarDia(atividades: DadosAtividade[]): Agregado {
  let estresse = 0;
  let kcal = 0;
  for (const a of atividades) {
    if (typeof a.hrss === "number") estresse += a.hrss;
    if (typeof a.calorias === "number") kcal += a.calorias;
  }
  return { estresse: Math.round(estresse * 100) / 100, kcal: Math.round(kcal), qtdAtividades: atividades.length };
}

/**
 * Recalcula o documento estresseDiario de um dia a partir das atividades (idempotente: reexecutar
 * dá o mesmo resultado, então retentativas do trigger não duplicam nada). Sem atividades, apaga o doc.
 */
export async function recalcularDia(uid: string, data: string): Promise<void> {
  if (!DATA_ISO.test(data)) return;
  const ref = db.doc(`estresseDiario/${idEstresseDiario(uid, data)}`);
  const snap = await db.collection("atividades").where("userId", "==", uid).where("data", "==", data).get();
  if (snap.empty) {
    await ref.delete();
    return;
  }
  await ref.set({
    userId: uid,
    data,
    ...agregarDia(snap.docs.map((d) => d.data())),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
}

/**
 * Reconstrói toda a agregação do usuário (para atividades anteriores ao trigger ou após correções).
 * Grava os dias com atividade e remove documentos de dias que não têm mais nenhuma.
 */
export async function reconstruirTudo(uid: string): Promise<{ dias: number; removidos: number }> {
  const atividades = await db.collection("atividades").where("userId", "==", uid).limit(5000).get();
  const porDia = new Map<string, DadosAtividade[]>();
  for (const doc of atividades.docs) {
    const data = doc.get("data");
    if (typeof data !== "string" || !DATA_ISO.test(data)) continue;
    porDia.set(data, [...(porDia.get(data) ?? []), doc.data()]);
  }

  const existentes = await db.collection("estresseDiario").where("userId", "==", uid).get();
  const operacoes: Array<(lote: FirebaseFirestore.WriteBatch) => void> = [];
  for (const [data, lista] of porDia) {
    operacoes.push((lote) =>
      lote.set(db.doc(`estresseDiario/${idEstresseDiario(uid, data)}`), {
        userId: uid,
        data,
        ...agregarDia(lista),
        atualizadoEm: FieldValue.serverTimestamp(),
      }),
    );
  }
  let removidos = 0;
  for (const doc of existentes.docs) {
    if (!porDia.has(doc.get("data"))) {
      operacoes.push((lote) => lote.delete(doc.ref));
      removidos += 1;
    }
  }

  for (let i = 0; i < operacoes.length; i += 400) {
    const lote = db.batch();
    for (const op of operacoes.slice(i, i + 400)) op(lote);
    await lote.commit();
  }
  return { dias: porDia.size, removidos };
}
