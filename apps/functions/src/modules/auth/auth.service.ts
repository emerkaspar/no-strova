import { PAPEIS, validarDadosPerfil, VERSAO_ACEITE_LGPD } from "@no-strova/domain";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { auth, db } from "../../shared/firebase";
import type { PerfilResumo, UsuarioPendente } from "./auth.types";

function perfilInicial(email: string) {
  return {
    nome: "",
    email,
    role: PAPEIS.ATLETA,
    aprovado: false,
    ativo: true,
    dataNascimento: null,
    criadoEm: FieldValue.serverTimestamp(),
  };
}

/** Cria users/{uid} com o perfil mínimo e `aprovado: false`. Idempotente. */
export async function criarPerfilInicial(uid: string, email: string): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, perfilInicial(email));
    }
  });
}

interface EntradaPerfil {
  nome: unknown;
  dataNascimento: unknown;
  aceiteLgpd: unknown;
}

/**
 * Completa o perfil (nome, data de nascimento, aceite LGPD) sem nunca tocar em
 * role, aprovado ou ativo. O aceite é carimbado com a versão vigente no servidor.
 */
export async function completarPerfil(uid: string, email: string, entrada: EntradaPerfil): Promise<PerfilResumo> {
  const dados = validarDadosPerfil(entrada);
  if (!dados.valido) {
    throw new HttpsError("invalid-argument", dados.erros.join(" "));
  }

  const ref = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.data();
    if (atual?.ativo === false) {
      throw new HttpsError("permission-denied", "Esta conta está bloqueada.");
    }

    const aceiteVigente = atual?.aceiteLgpd?.versao === VERSAO_ACEITE_LGPD;
    if (!aceiteVigente && entrada.aceiteLgpd !== true) {
      throw new HttpsError("failed-precondition", "É necessário aceitar o tratamento de dados de saúde para continuar.");
    }

    const alteracoes: Record<string, unknown> = {
      nome: dados.valores.nome,
      dataNascimento: dados.valores.dataNascimento,
    };
    if (!aceiteVigente) {
      alteracoes.aceiteLgpd = { versao: VERSAO_ACEITE_LGPD, em: FieldValue.serverTimestamp() };
    }

    if (snap.exists) {
      tx.update(ref, alteracoes);
    } else {
      tx.set(ref, { ...perfilInicial(email), ...alteracoes });
    }

    return {
      role: atual?.role ?? PAPEIS.ATLETA,
      aprovado: atual?.aprovado === true,
      ativo: true,
    };
  });
}

export async function listarUsuariosPendentes(): Promise<UsuarioPendente[]> {
  const snap = await db.collection("users").where("aprovado", "==", false).orderBy("criadoEm", "asc").limit(200).get();

  return snap.docs
    .filter((d) => d.get("ativo") === true && d.get("aceiteLgpd.versao"))
    .map((d) => {
      const criadoEm = d.get("criadoEm") as Timestamp | undefined;
      return {
        uid: d.id,
        nome: String(d.get("nome") ?? ""),
        email: String(d.get("email") ?? ""),
        criadoEm: criadoEm ? criadoEm.toMillis() : null,
      };
    });
}

async function carregarAlvo(uid: string) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Usuário não encontrado.");
  }
  if (snap.get("role") === PAPEIS.ADMIN) {
    throw new HttpsError("failed-precondition", "Não é possível alterar um administrador.");
  }
  return snap.ref;
}

export async function definirAprovacao(uid: string, aprovado: boolean): Promise<void> {
  const ref = await carregarAlvo(uid);
  await ref.update({ aprovado });
}

/** Bloqueia ou libera a conta: atualiza users/{uid} e o Auth (desabilita login e revoga sessões). */
export async function definirAtivo(uid: string, ativo: boolean): Promise<void> {
  const ref = await carregarAlvo(uid);
  await ref.update({ ativo });
  await auth.updateUser(uid, { disabled: !ativo });
  if (!ativo) {
    await auth.revokeRefreshTokens(uid);
  }
}
