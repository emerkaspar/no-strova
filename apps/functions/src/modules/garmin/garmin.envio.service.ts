import { diaNoFuso, montarPlanoParaExportar } from "@no-strova/domain";
import { GarminConnect } from "@flow-js/garmin-connect";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";
import { carregarConfigs } from "../atividades/atividades.service";
import { enviarTreinos, motivoDaFalha, type RegistroEnvio, type ResultadoEnvio } from "./garmin.envio";
import type { TreinoPlano } from "./garmin.treino";

/** Máximo de dias do período e de treinos por envio (o envio roda numa chamada só, de até 5 minutos). */
export const MAXIMO_DIAS = 62;
export const MAXIMO_TREINOS = 40;
const ESPERA_CODIGO_MS = 150_000;
const INTERVALO_CODIGO_MS = 2_000;
/** Um envio travado deixa de bloquear novos envios depois disso. */
const TRAVA_MS = 6 * 60 * 1000;
const ESTADOS_EM_ANDAMENTO = ["conectando", "aguardando-codigo", "enviando"];

export interface EntradaEnvio {
  email: string;
  senha: string;
  de: string;
  ate: string;
}

export interface RespostaEnvio extends ResultadoEnvio {
  /** Treinos do período que não puderam ser exportados (sem passos nem duração). */
  semPassos: number;
  semConfigFc: boolean;
  periodo: { de: string; ate: string };
}

// O status do envio (para o app mostrar o andamento e pedir o código) fica em users/{uid}/garminEnvio/atual, que o dono
// lê e só o Admin SDK escreve. O código de duas etapas viaja por users/{uid}/segredos/garminCodigo (negado ao cliente).
const docStatus = (uid: string) => db.doc(`users/${uid}/garminEnvio/atual`);
const docCodigo = (uid: string) => db.doc(`users/${uid}/segredos/garminCodigo`);
const docRegistro = (uid: string, treinoId: string) => db.doc(`users/${uid}/garminEnvio/treino-${treinoId}`);

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function validarEntrada(dados: Record<string, unknown>): EntradaEnvio {
  const email = typeof dados.email === "string" ? dados.email.trim() : "";
  const senha = typeof dados.senha === "string" ? dados.senha : "";
  const de = typeof dados.de === "string" ? dados.de : "";
  const ate = typeof dados.ate === "string" ? dados.ate : "";
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "Informe o e-mail da sua conta do Garmin Connect.");
  }
  if (senha.length === 0 || senha.length > 256) {
    throw new HttpsError("invalid-argument", "Informe a senha da sua conta do Garmin Connect.");
  }
  if (!DATA.test(de) || !DATA.test(ate) || Number.isNaN(Date.parse(`${de}T00:00:00Z`)) || Number.isNaN(Date.parse(`${ate}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "Período inválido.");
  }
  if (de > ate || diasEntre(de, ate) >= MAXIMO_DIAS) {
    throw new HttpsError("invalid-argument", `Escolha um período de no máximo ${MAXIMO_DIAS} dias.`);
  }
  return { email, senha, de, ate };
}

async function definirStatus(uid: string, campos: Record<string, unknown>): Promise<void> {
  await docStatus(uid).set({ ...campos, atualizadoEm: FieldValue.serverTimestamp() });
}

async function reservarEnvio(uid: string): Promise<void> {
  const atual = (await docStatus(uid).get()).data();
  const em = atual?.atualizadoEm instanceof Timestamp ? atual.atualizadoEm.toMillis() : 0;
  if (ESTADOS_EM_ANDAMENTO.includes(atual?.estado) && Date.now() - em < TRAVA_MS) {
    throw new HttpsError("failed-precondition", "Já existe um envio em andamento. Aguarde terminar.");
  }
  await definirStatus(uid, { estado: "conectando" });
}

/** Espera o código de duas etapas, que o app grava via `informarCodigo` depois que o usuário o digita. */
async function aguardarCodigo(uid: string): Promise<string> {
  await docCodigo(uid).delete();
  await definirStatus(uid, { estado: "aguardando-codigo" });
  const limite = Date.now() + ESPERA_CODIGO_MS;
  while (Date.now() < limite) {
    const codigo = (await docCodigo(uid).get()).data()?.codigo;
    if (typeof codigo === "string" && codigo !== "") {
      await docCodigo(uid).delete();
      await definirStatus(uid, { estado: "conectando" });
      return codigo;
    }
    await new Promise((r) => setTimeout(r, INTERVALO_CODIGO_MS));
  }
  throw new HttpsError("deadline-exceeded", "O código de verificação não foi informado a tempo. Envie novamente.");
}

export async function informarCodigo(uid: string, valor: unknown): Promise<void> {
  const codigo = typeof valor === "string" ? valor.replace(/\s/g, "") : "";
  if (!/^[0-9A-Za-z]{4,10}$/.test(codigo)) {
    throw new HttpsError("invalid-argument", "Digite o código de verificação que o Garmin enviou.");
  }
  if ((await docStatus(uid).get()).data()?.estado !== "aguardando-codigo") {
    throw new HttpsError("failed-precondition", "Nenhum envio está esperando o código.");
  }
  await docCodigo(uid).set({ codigo, criadoEm: FieldValue.serverTimestamp() });
}

async function entrar(uid: string, entrada: EntradaEnvio): Promise<GarminConnect> {
  const cliente = new GarminConnect({ username: entrada.email, password: entrada.senha });
  try {
    await cliente.login(undefined, undefined, { mfaHandler: () => aguardarCodigo(uid) });
  } catch (erro) {
    if (erro instanceof HttpsError) throw erro;
    // nunca registra nem devolve dados da requisição (a senha viaja nela): só a mensagem curta
    logger.warn("Garmin: falha no login", { uid, motivo: motivoDaFalha(erro) });
    throw new HttpsError(
      "failed-precondition",
      "Não foi possível entrar no Garmin Connect. Confira o e-mail e a senha (teste entrando em connect.garmin.com). Se estiverem certos, o Garmin pode ter bloqueado o acesso do servidor ou limitado as tentativas: espere alguns minutos e tente de novo.",
    );
  }
  return cliente;
}

/**
 * Envia para o Garmin Connect os treinos planejados do período: entra com a conta informada (e o código de duas etapas, se
 * houver), cria cada treino e o agenda no calendário. A senha é usada só nesta chamada e nunca é gravada nem registrada.
 */
export async function enviarPlano(uid: string, entrada: EntradaEnvio): Promise<RespostaEnvio> {
  await reservarEnvio(uid);
  try {
    const hoje = diaNoFuso(Date.now());
    const de = entrada.de < hoje ? hoje : entrada.de;
    const [treinosSnap, configs] = await Promise.all([
      db.collection("treinosPlanejados").where("userId", "==", uid).where("data", ">=", de).where("data", "<=", entrada.ate).get(),
      carregarConfigs(uid),
    ]);
    const treinos = treinosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { plano, ignorados } = montarPlanoParaExportar(treinos, { configs, de, ate: entrada.ate });
    const doPlano = plano.treinos as TreinoPlano[];
    if (doPlano.length === 0) {
      throw new HttpsError("failed-precondition", "Não há treinos planejados nesse período para enviar.");
    }
    if (doPlano.length > MAXIMO_TREINOS) {
      throw new HttpsError("invalid-argument", `Há ${doPlano.length} treinos nesse período. Escolha um período menor (até ${MAXIMO_TREINOS} treinos).`);
    }

    const cliente = await entrar(uid, entrada);
    const registrosSnap = doPlano.length > 0 ? await db.getAll(...doPlano.map((t) => docRegistro(uid, t.id))) : [];
    const registros = new Map<string, RegistroEnvio>();
    registrosSnap.forEach((snap, i) => {
      const r = snap.data();
      if (r && typeof r.workoutId === "string" && typeof r.assinatura === "string") registros.set(doPlano[i].id, { workoutId: r.workoutId, assinatura: r.assinatura });
    });

    await definirStatus(uid, { estado: "enviando", feitos: 0, total: doPlano.length });
    const resultado = await enviarTreinos(
      cliente,
      doPlano,
      registros,
      async (treinoId, registro) => {
        await docRegistro(uid, treinoId).set({ ...registro, enviadoEm: FieldValue.serverTimestamp() });
      },
      (feitos, total) => definirStatus(uid, { estado: "enviando", feitos, total }),
    );

    const resposta: RespostaEnvio = {
      ...resultado,
      semPassos: ignorados.length,
      semConfigFc: configs.length === 0,
      periodo: { de, ate: entrada.ate },
    };
    await definirStatus(uid, { estado: "concluido", resultado: resposta });
    return resposta;
  } catch (erro) {
    const mensagem = erro instanceof HttpsError ? erro.message : "Não foi possível enviar os treinos agora. Tente novamente.";
    if (!(erro instanceof HttpsError)) logger.error("Garmin: falha no envio de treinos", { uid, motivo: motivoDaFalha(erro) });
    await definirStatus(uid, { estado: "erro", mensagem }).catch(() => {});
    throw erro instanceof HttpsError ? erro : new HttpsError("internal", mensagem);
  } finally {
    await docCodigo(uid).delete().catch(() => {});
  }
}
