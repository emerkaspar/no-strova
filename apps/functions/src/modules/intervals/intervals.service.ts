import { configVigenteEm, diaNoFuso, montarPlanoParaExportar } from "@no-strova/domain";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";
import { carregarConfigs } from "../atividades/atividades.service";
import { criptografar, descriptografar } from "../garmin/garmin.cripto";
import { atualizarEvento, atualizarLthr, criarEvento, type EsporteIntervals, IntervalsErroApi, obterAtleta, obterLthr, type Requisitor } from "./intervals.cliente";
import { enviarTreinos, motivoDaFalha, type RegistroEnvio, type ResultadoEnvio, type TreinoPlano } from "./intervals.envio";

/** Máximo de dias do período e de treinos por envio. */
export const MAXIMO_DIAS = 62;
export const MAXIMO_TREINOS = 60;

export interface SituacaoIntervals {
  conectado: boolean;
  atleta: string | null;
}

/** LTHR do No Strova e o de cada esporte no intervals.icu (null: sem LTHR configurado lá). */
export interface SituacaoLthr {
  nostrova: number | null;
  ciclismo: number | null;
  corrida: number | null;
}

const ESPORTES_LTHR: Record<string, EsporteIntervals> = { ciclismo: "Ride", corrida: "Run" };

export interface RespostaEnvio extends ResultadoEnvio {
  /** Treinos do período que não puderam ser enviados (sem passos nem duração). */
  semPassos: number;
  /** LTHR da configuração de FC no No Strova: o intervals.icu precisa ter o mesmo para as faixas baterem. */
  lthr: number | null;
  periodo: { de: string; ate: string };
}

// A chave de API (cifrada) fica em users/{uid}/segredos/intervals, que nenhuma regra libera: só o Admin SDK lê e escreve.
// O registro do que já foi enviado fica em users/{uid}/intervalsEnvio/{treinoId} (também só Admin SDK).
const docChave = (uid: string) => db.doc(`users/${uid}/segredos/intervals`);
const docRegistro = (uid: string, treinoId: string) => db.doc(`users/${uid}/intervalsEnvio/${treinoId}`);

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function validarChave(valor: unknown): string {
  const chave = typeof valor === "string" ? valor.trim() : "";
  if (chave.length < 8 || chave.length > 200 || /\s/.test(chave)) {
    throw new HttpsError("invalid-argument", "A chave informada não parece válida. Cole a chave de API inteira, sem espaços.");
  }
  return chave;
}

export function validarPeriodo(dados: Record<string, unknown>): { de: string; ate: string } {
  const de = typeof dados.de === "string" ? dados.de : "";
  const ate = typeof dados.ate === "string" ? dados.ate : "";
  const dia = (d: string) => Date.parse(`${d}T00:00:00Z`);
  if (!DATA.test(de) || !DATA.test(ate) || Number.isNaN(dia(de)) || Number.isNaN(dia(ate))) {
    throw new HttpsError("invalid-argument", "Período inválido.");
  }
  if (de > ate || Math.round((dia(ate) - dia(de)) / 86_400_000) >= MAXIMO_DIAS) {
    throw new HttpsError("invalid-argument", `Escolha um período de no máximo ${MAXIMO_DIAS} dias.`);
  }
  return { de, ate };
}

function traduzirErro(erro: unknown): HttpsError {
  if (erro instanceof IntervalsErroApi && (erro.status === 401 || erro.status === 403)) {
    return new HttpsError("failed-precondition", "O intervals.icu recusou a chave. Confira se copiou a chave de API inteira (Settings → Developer Settings).");
  }
  if (erro instanceof IntervalsErroApi && erro.status === 429) {
    return new HttpsError("resource-exhausted", "O intervals.icu limitou as requisições. Tente de novo em instantes.");
  }
  logger.warn("intervals.icu: falha na chamada", { motivo: motivoDaFalha(erro) });
  return new HttpsError("unavailable", "Não foi possível falar com o intervals.icu agora. Tente novamente em instantes.");
}

export async function conectar(uid: string, chaveBruta: unknown, segredo: string, requisitor?: Requisitor): Promise<SituacaoIntervals> {
  const chave = validarChave(chaveBruta);
  let atleta;
  try {
    atleta = await obterAtleta(chave, requisitor); // valida a chave antes de guardar
  } catch (erro) {
    throw traduzirErro(erro);
  }
  await docChave(uid).set({ chaveCifrada: criptografar(chave, segredo), atleta: atleta.name ?? atleta.id, criadaEm: Timestamp.now() });
  return { conectado: true, atleta: atleta.name ?? atleta.id };
}

export async function situacao(uid: string): Promise<SituacaoIntervals> {
  const snap = await docChave(uid).get();
  if (!snap.exists || typeof snap.get("chaveCifrada") !== "string") return { conectado: false, atleta: null };
  const atleta = snap.get("atleta");
  return { conectado: true, atleta: typeof atleta === "string" ? atleta : null };
}

export async function desconectar(uid: string): Promise<void> {
  await docChave(uid).delete();
}

async function chaveDoUsuario(uid: string, segredo: string): Promise<string> {
  const cifrada = (await docChave(uid).get()).get("chaveCifrada");
  if (typeof cifrada !== "string") throw new HttpsError("failed-precondition", "Conecte o intervals.icu primeiro.");
  return descriptografar(cifrada, segredo);
}

async function lthrDoNoStrova(uid: string): Promise<number | null> {
  return configVigenteEm(await carregarConfigs(uid), diaNoFuso(Date.now()))?.lthr ?? null;
}

/** Só leitura: o LTHR do No Strova e o do intervals.icu (ciclismo e corrida), para o app avisar quando forem diferentes. */
export async function situacaoDoLthr(uid: string, segredo: string, requisitor?: Requisitor): Promise<SituacaoLthr> {
  const chave = await chaveDoUsuario(uid, segredo);
  const nostrova = await lthrDoNoStrova(uid);
  try {
    const [ciclismo, corrida] = await Promise.all([obterLthr(chave, "Ride", requisitor), obterLthr(chave, "Run", requisitor)]);
    return { nostrova, ciclismo, corrida };
  } catch (erro) {
    throw traduzirErro(erro);
  }
}

export function validarEsportesDoLthr(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? [...new Set(valor)] : [];
  if (lista.length === 0 || lista.some((e) => typeof e !== "string" || !ESPORTES_LTHR[e])) {
    throw new HttpsError("invalid-argument", "Escolha o esporte (ciclismo ou corrida) que deve ter o LTHR atualizado.");
  }
  return lista as string[];
}

/**
 * Grava no intervals.icu o LTHR atual do No Strova, nos esportes escolhidos. Só roda por pedido explícito do usuário (botão com
 * confirmação). Confere a resposta do intervals.icu: se ele não confirmar o valor, avisa em vez de dizer que deu certo.
 */
export async function atualizarLthrNoIntervals(uid: string, esportes: string[], segredo: string, requisitor?: Requisitor): Promise<SituacaoLthr> {
  const chave = await chaveDoUsuario(uid, segredo);
  const lthr = await lthrDoNoStrova(uid);
  if (lthr === null) throw new HttpsError("failed-precondition", "Cadastre o LTHR na sua configuração de FC (Configuração) antes de atualizar o intervals.icu.");
  try {
    for (const esporte of esportes) {
      const confirmado = await atualizarLthr(chave, ESPORTES_LTHR[esporte], lthr, requisitor);
      if (confirmado !== lthr) throw new HttpsError("unavailable", "O intervals.icu não confirmou a alteração do LTHR. Altere manualmente em Settings, na configuração do esporte.");
    }
  } catch (erro) {
    if (erro instanceof HttpsError) throw erro;
    if (erro instanceof IntervalsErroApi && erro.status === 403) {
      throw new HttpsError("permission-denied", "A chave de API não tem permissão para alterar as configurações do intervals.icu. Altere o LTHR manualmente em Settings, na configuração do esporte.");
    }
    throw traduzirErro(erro);
  }
  return situacaoDoLthr(uid, segredo, requisitor);
}

/** Envia ao intervals.icu os treinos planejados do período (que o intervals.icu repassa ao Garmin Connect). */
export async function enviarPlano(uid: string, periodo: { de: string; ate: string }, segredo: string, requisitor?: Requisitor): Promise<RespostaEnvio> {
  const snapChave = await docChave(uid).get();
  const cifrada = snapChave.get("chaveCifrada");
  if (typeof cifrada !== "string") {
    throw new HttpsError("failed-precondition", "Conecte o intervals.icu antes de enviar os treinos.");
  }
  const chave = descriptografar(cifrada, segredo);

  const hoje = diaNoFuso(Date.now());
  const de = periodo.de < hoje ? hoje : periodo.de;
  const [treinosSnap, configs] = await Promise.all([
    db.collection("treinosPlanejados").where("userId", "==", uid).where("data", ">=", de).where("data", "<=", periodo.ate).get(),
    carregarConfigs(uid),
  ]);
  const treinos = treinosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const { plano, ignorados } = montarPlanoParaExportar(treinos, { configs, de, ate: periodo.ate });
  const doPlano = plano.treinos as TreinoPlano[];
  if (doPlano.length === 0) throw new HttpsError("failed-precondition", "Não há treinos planejados nesse período para enviar.");
  if (doPlano.length > MAXIMO_TREINOS) {
    throw new HttpsError("invalid-argument", `Há ${doPlano.length} treinos nesse período. Escolha um período menor (até ${MAXIMO_TREINOS} treinos).`);
  }

  const registrosSnap = await db.getAll(...doPlano.map((t) => docRegistro(uid, t.id)));
  const registros = new Map<string, RegistroEnvio>();
  registrosSnap.forEach((snap, i) => {
    const r = snap.data();
    if (r && typeof r.eventoId === "string" && typeof r.assinatura === "string") registros.set(doPlano[i].id, { eventoId: r.eventoId, assinatura: r.assinatura });
  });

  let resultado: ResultadoEnvio;
  try {
    resultado = await enviarTreinos(
      {
        criar: (evento) => criarEvento(chave, evento, requisitor),
        atualizar: (eventoId, evento) => atualizarEvento(chave, eventoId, evento, requisitor),
      },
      doPlano,
      registros,
      async (treinoId, registro) => {
        await docRegistro(uid, treinoId).set({ ...registro, enviadoEm: FieldValue.serverTimestamp() });
      },
    );
  } catch (erro) {
    throw traduzirErro(erro);
  }
  // chave recusada em todos os treinos: avisa em vez de listar uma falha por treino
  if (resultado.falhas === doPlano.length && resultado.problemas.every((p) => /recusou a chave/.test(p.motivo))) {
    throw traduzirErro(new IntervalsErroApi(401, "chave recusada"));
  }
  return { ...resultado, semPassos: ignorados.length, lthr: configVigenteEm(configs, doPlano[0].data)?.lthr ?? null, periodo: { de, ate: periodo.ate } };
}
