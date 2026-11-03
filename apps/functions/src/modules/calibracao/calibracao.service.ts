import { atualizarCalibracao, reconstruirCalibracao } from "@no-strova/domain";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../shared/firebase";
import { carregarConfigs } from "../atividades/atividades.service";
import { amostraDaAtividade, decidirMudanca } from "./calibracao";

const caminho = (uid: string) => `calibracoes/${uid}`;

/**
 * Atualiza o resumo de calibração do usuário depois da mudança de uma atividade: lê 1 documento e grava 1, em
 * transação. É idempotente (remove pela id e acrescenta), então retentativas do gatilho são inofensivas.
 */
export async function aplicarMudancaDeAtividade(
  uid: string,
  atividadeId: string,
  antes: Record<string, unknown> | undefined,
  depois: Record<string, unknown> | undefined,
): Promise<void> {
  const configs = await carregarConfigs(uid);
  const mudanca = decidirMudanca(atividadeId, antes, depois, configs);
  if (!mudanca.gravar) return;

  const ref = db.doc(caminho(uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const novo = atualizarCalibracao(snap.exists ? (snap.data() as { chaves?: Record<string, never> }) : null, {
      removerId: mudanca.removerId,
      amostra: mudanca.amostra,
    });
    tx.set(ref, { userId: uid, ...novo, atualizadoEm: FieldValue.serverTimestamp() });
  });
}

/**
 * Reconstrói a calibração do zero a partir das atividades (para atividades anteriores ao gatilho e depois de
 * recalcular o histórico, quando o HRSS e as zonas mudam).
 */
export async function reconstruirCalibracaoDoUsuario(uid: string): Promise<{ amostras: number }> {
  const configs = await carregarConfigs(uid);
  const snap = await db.collection("atividades").where("userId", "==", uid).limit(5000).get();
  const amostras = snap.docs.map((d) => amostraDaAtividade(d.id, d.data(), configs)).filter((a): a is NonNullable<typeof a> => a !== null);
  await db.doc(caminho(uid)).set({ userId: uid, ...reconstruirCalibracao(amostras), atualizadoEm: FieldValue.serverTimestamp() });
  return { amostras: amostras.length };
}
