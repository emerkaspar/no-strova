import {
  PAPEIS,
  PAPEIS_ATRIBUIVEIS,
  RECURSOS_PADRAO,
  recursosDoUsuario,
  validarDadosPerfil,
  validarRecursos,
  VERSAO_ACEITE_LGPD,
} from "@no-strova/domain";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import { auth, db } from "../../shared/firebase";
import type { PerfilResumo, UsuarioAdmin, UsuarioPendente } from "./auth.types";

function perfilInicial(email: string) {
  return {
    nome: "",
    email,
    role: PAPEIS.ATLETA,
    aprovado: false,
    ativo: true,
    recursos: { ...RECURSOS_PADRAO },
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

function paraUsuarioAdmin(d: FirebaseFirestore.QueryDocumentSnapshot): UsuarioAdmin {
  const criadoEm = d.get("criadoEm") as Timestamp | undefined;
  return {
    uid: d.id,
    nome: String(d.get("nome") ?? ""),
    email: String(d.get("email") ?? ""),
    criadoEm: criadoEm ? criadoEm.toMillis() : null,
    role: String(d.get("role") ?? PAPEIS.ATLETA),
    aprovado: d.get("aprovado") === true,
    ativo: d.get("ativo") === true,
    recursos: recursosDoUsuario(d.data()),
  };
}

export async function listarTodosUsuarios(): Promise<UsuarioAdmin[]> {
  const snap = await db.collection("users").limit(1000).get();
  return snap.docs.map(paraUsuarioAdmin);
}

export interface EntradaNovoUsuario {
  nome: unknown;
  email: unknown;
  senha: unknown;
  role: unknown;
  recursos: unknown;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MINIMA = 8;

function lerRole(role: unknown): string {
  if (typeof role !== "string" || !(PAPEIS_ATRIBUIVEIS as readonly string[]).includes(role)) {
    throw new HttpsError("invalid-argument", "Papel inválido.");
  }
  return role;
}

function lerRecursos(recursos: unknown) {
  const r = validarRecursos(recursos);
  if (!r.valido || !r.valores) throw new HttpsError("invalid-argument", r.erro ?? "Recursos inválidos.");
  return r.valores;
}

function lerNome(nome: unknown): string {
  const dados = validarDadosPerfil({ nome });
  if (!dados.valido) throw new HttpsError("invalid-argument", dados.erros.join(" "));
  return dados.valores.nome;
}

/**
 * Cria a conta no Auth e o perfil já aprovado. O aceite LGPD fica por conta da pessoa: no primeiro acesso ela cai
 * na tela de completar o cadastro. Recursos nascem como o admin escolheu (padrão: IA ligada, Garmin desligado).
 */
export async function criarUsuario(entrada: EntradaNovoUsuario): Promise<UsuarioAdmin> {
  const nome = lerNome(entrada.nome);
  const email = typeof entrada.email === "string" ? entrada.email.trim().toLowerCase() : "";
  if (!REGEX_EMAIL.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }
  if (typeof entrada.senha !== "string" || entrada.senha.length < SENHA_MINIMA || entrada.senha.length > 128) {
    throw new HttpsError("invalid-argument", `A senha temporária deve ter de ${SENHA_MINIMA} a 128 caracteres.`);
  }
  const role = lerRole(entrada.role);
  const recursos = lerRecursos(entrada.recursos);

  let uid: string;
  try {
    uid = (await auth.createUser({ email, password: entrada.senha, displayName: nome })).uid;
  } catch (err) {
    const codigo = (err as { code?: string }).code;
    if (codigo === "auth/email-already-exists") throw new HttpsError("already-exists", "Já existe uma conta com este e-mail.");
    if (codigo === "auth/invalid-password") throw new HttpsError("invalid-argument", "Senha inválida.");
    throw err;
  }

  // A trigger bootstrapUserOnCreate pode ter criado o perfil mínimo antes: aqui ele é completado, não duplicado.
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const existe = (await tx.get(ref)).exists;
    const campos = { nome, email, role, aprovado: true, ativo: true, recursos };
    if (existe) tx.update(ref, campos);
    else tx.set(ref, { ...perfilInicial(email), ...campos });
  });
  return paraUsuarioAdmin((await ref.get()) as FirebaseFirestore.QueryDocumentSnapshot);
}

export interface EntradaAtualizacao {
  nome?: unknown;
  role?: unknown;
  recursos?: unknown;
}

/**
 * Edita nome, papel e recursos. Administradores só têm os recursos alterados (papel e nome ficam como estão, como
 * em aprovar e bloquear).
 */
export async function atualizarUsuario(uid: string, entrada: EntradaAtualizacao): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Usuário não encontrado.");
  const ehAdminAlvo = snap.get("role") === PAPEIS.ADMIN;

  const alteracoes: Record<string, unknown> = {};
  if (entrada.recursos !== undefined) alteracoes.recursos = lerRecursos(entrada.recursos);
  if (!ehAdminAlvo) {
    if (entrada.nome !== undefined) alteracoes.nome = lerNome(entrada.nome);
    if (entrada.role !== undefined) alteracoes.role = lerRole(entrada.role);
  } else if (entrada.nome !== undefined || entrada.role !== undefined) {
    throw new HttpsError("failed-precondition", "Não é possível alterar o nome ou o papel de um administrador.");
  }
  if (Object.keys(alteracoes).length === 0) throw new HttpsError("invalid-argument", "Nada para alterar.");

  await ref.update(alteracoes);
  if (typeof alteracoes.nome === "string") {
    await auth.updateUser(uid, { displayName: alteracoes.nome });
  }
}

// Coleções de dados do usuário (todas guardam `userId`).
const COLECOES_DO_USUARIO = [
  "atividades",
  "estresseDiario",
  "treinosPlanejados",
  "treinosModelos",
  "metasForma",
  "metasCondicionamento",
  "metasPeso",
  "metasProgressao",
  "pesagens",
  "configsAtleta",
  "conquistas",
  "calibracoes",
  "iaRascunhos",
  "iaUso",
];

/**
 * Exclui a conta e todos os dados do usuário (LGPD): Auth, perfil e segredos, coleções de negócio, preferências e
 * os arquivos do Storage. Não apaga administradores.
 */
export async function excluirUsuario(uid: string): Promise<void> {
  await carregarAlvo(uid);

  for (const colecao of COLECOES_DO_USUARIO) {
    for (;;) {
      const lote = await db.collection(colecao).where("userId", "==", uid).limit(300).get();
      if (lote.empty) break;
      for (const d of lote.docs) await db.recursiveDelete(d.ref);
    }
  }
  await db.recursiveDelete(db.doc(`preferencias/${uid}`));
  await getStorage().bucket().deleteFiles({ prefix: `atividades/${uid}/`, force: true });

  // Auth primeiro: sem a conta, o usuário não volta a gravar dados enquanto o perfil é removido.
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  await db.recursiveDelete(db.doc(`users/${uid}`));
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
