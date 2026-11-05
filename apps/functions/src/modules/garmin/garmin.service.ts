import { diaNoFuso } from "@no-strova/domain";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";
import {
  caminhoDoArquivo,
  FONTE_GARMIN,
  type PedidoArquivo,
  processarArquivo,
  TAMANHO_MAXIMO_BYTES,
} from "../atividades/atividades.service";
import {
  baixarArquivoZip,
  descreverDownload,
  extrairItens,
  GarminErroApi,
  listarAtividades,
  obterFit,
  obterToken,
  type Requisitor,
} from "./garmin.cliente";
import { exigirOutraFonteDesconectada } from "../sincronizacao/fonte";
import { criptografar, descriptografar } from "./garmin.cripto";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Validade escolhida ao criar a chave no Garmin Connect (a API não informa a data de expiração). */
export const VALIDADES_CHAVE_DIAS = [30, 90, 180, 365] as const;
/** Períodos oferecidos ao sincronizar; o máximo é 6 meses. */
export const PERIODOS_DIAS = [30, 60, 90, 180] as const;
export const ATIVIDADES_POR_LOTE = 10;
/** Teto de atividades trazidas em uma sincronização. */
export const LIMITE_POR_SINCRONIZACAO = 200;

export interface SituacaoGarmin {
  conectado: boolean;
  expiraEm: string | null;
  diasParaExpirar: number | null;
  ultimaSincronizacao: string | null;
}

export interface ResultadoLote {
  importadas: number;
  jaExistiam: number;
  semFc: number;
  falhas: number;
  /** Por que cada atividade que ficou de fora (sem FC ou com falha) não foi importada. */
  problemas: Array<{ atividade: string; motivo: string }>;
  /** Posição para pedir o próximo lote. */
  proximo: number;
  terminou: boolean;
  /** Chegou ao teto de atividades por sincronização, com mais atividades no período. */
  limitado: boolean;
}

function docChave(uid: string) {
  return db.doc(`users/${uid}/segredos/garmin`);
}

function paraIso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

export function validarChave(valor: unknown): string {
  const chave = typeof valor === "string" ? valor.trim() : "";
  if (chave.length < 16 || chave.length > 1024 || /\s/.test(chave)) {
    throw new HttpsError("invalid-argument", "A chave informada não parece válida. Cole a chave inteira, sem espaços.");
  }
  return chave;
}

export function validarValidade(valor: unknown): number {
  if (typeof valor !== "number" || !(VALIDADES_CHAVE_DIAS as readonly number[]).includes(valor)) {
    throw new HttpsError("invalid-argument", "Escolha a validade que você definiu ao criar a chave.");
  }
  return valor;
}

/** Traduz as falhas da API do Garmin em mensagens para o usuário. */
export function traduzirErro(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof GarminErroApi) {
    if (err.status === 401 || err.status === 403) {
      return new HttpsError(
        "failed-precondition",
        "O Garmin não aceitou a chave: ela é inválida, foi apagada ou expirou. Gere outra no Garmin Connect e conecte de novo.",
        { codigo: "chave-invalida" },
      );
    }
    if (err.status === 429) {
      return new HttpsError("resource-exhausted", "O Garmin pediu para aguardar. Tente de novo em alguns minutos.");
    }
  }
  logger.error("Falha ao falar com o Garmin", err);
  return new HttpsError("unavailable", "Não foi possível falar com o Garmin agora. Tente novamente em instantes.");
}

export async function conectar(
  uid: string,
  chaveBruta: unknown,
  validadeBruta: unknown,
  segredo: string,
  requisitor?: Requisitor,
): Promise<SituacaoGarmin> {
  const chave = validarChave(chaveBruta);
  const validade = validarValidade(validadeBruta);
  await exigirOutraFonteDesconectada(uid, "garmin");
  try {
    await obterToken(chave, requisitor); // valida a chave antes de guardar
  } catch (err) {
    throw traduzirErro(err);
  }
  const agora = Date.now();
  await docChave(uid).set(
    {
      chaveCifrada: criptografar(chave, segredo),
      criadaEm: Timestamp.fromMillis(agora),
      expiraEm: Timestamp.fromMillis(agora + validade * DIA_MS),
    },
    { merge: true },
  );
  return situacao(uid);
}

export async function situacao(uid: string): Promise<SituacaoGarmin> {
  const snap = await docChave(uid).get();
  if (!snap.exists || typeof snap.get("chaveCifrada") !== "string") {
    return { conectado: false, expiraEm: null, diasParaExpirar: null, ultimaSincronizacao: null };
  }
  const expira = snap.get("expiraEm");
  return {
    conectado: true,
    expiraEm: paraIso(expira),
    diasParaExpirar: expira instanceof Timestamp ? Math.ceil((expira.toMillis() - Date.now()) / DIA_MS) : null,
    ultimaSincronizacao: paraIso(snap.get("ultimaSincronizacao")),
  };
}

export async function desconectar(uid: string): Promise<void> {
  await docChave(uid).delete();
}

/** Quantos dias retroceder: o período escolhido, ou, sem escolha, desde a última sincronização (com 1 dia de folga). */
export function diasDaSincronizacao(escolhido: unknown, ultimaMs: number | null, agoraMs: number): number {
  if (escolhido !== undefined && escolhido !== null) {
    if (typeof escolhido !== "number" || !(PERIODOS_DIAS as readonly number[]).includes(escolhido)) {
      throw new HttpsError("invalid-argument", "Período inválido. Escolha 30, 60, 90 ou 180 dias.");
    }
    return escolhido;
  }
  if (ultimaMs === null) throw new HttpsError("invalid-argument", "Escolha o período a sincronizar.");
  const dias = Math.ceil((agoraMs - ultimaMs) / DIA_MS) + 1;
  return Math.min(Math.max(dias, 1), PERIODOS_DIAS[PERIODOS_DIAS.length - 1]);
}

export function posicao(valor: unknown): number {
  if (valor === undefined || valor === null) return 0;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) {
    throw new HttpsError("invalid-argument", "Posição inválida.");
  }
  return valor;
}

/**
 * Traz um lote de atividades do Garmin: lista a página, baixa o arquivo original de cada atividade nova e
 * a processa pelo mesmo caminho do envio manual. O cliente repete a chamada, com `proximo`, até `terminou`.
 */
export async function sincronizarLote(
  uid: string,
  dataNascimento: string | null,
  entrada: Record<string, unknown>,
  segredo: string,
  requisitor?: Requisitor,
): Promise<ResultadoLote> {
  const inicio = posicao(entrada.inicio);
  const agora = Date.now();

  const snap = await docChave(uid).get();
  const cifrada = snap.get("chaveCifrada");
  if (!snap.exists || typeof cifrada !== "string") {
    throw new HttpsError("failed-precondition", "Conecte sua conta do Garmin antes de sincronizar.");
  }
  const expira = snap.get("expiraEm");
  if (expira instanceof Timestamp && expira.toMillis() <= agora) {
    throw new HttpsError(
      "failed-precondition",
      "A chave do Garmin expirou. Gere outra no Garmin Connect e conecte de novo.",
      { codigo: "chave-invalida" },
    );
  }
  const ultima = snap.get("ultimaSincronizacao");
  const dias = diasDaSincronizacao(entrada.dias, ultima instanceof Timestamp ? ultima.toMillis() : null, agora);

  const resultado: ResultadoLote = { importadas: 0, jaExistiam: 0, semFc: 0, falhas: 0, problemas: [], proximo: inicio, terminou: false, limitado: false };
  if (inicio >= LIMITE_POR_SINCRONIZACAO) {
    return { ...resultado, terminou: true, limitado: true };
  }

  let chave: string;
  try {
    chave = descriptografar(cifrada, segredo);
  } catch (err) {
    logger.error("Não foi possível descriptografar a chave do Garmin", err);
    throw new HttpsError("failed-precondition", "Conecte sua conta do Garmin de novo.", { codigo: "chave-invalida" });
  }

  let token: string;
  let itens;
  try {
    token = await obterToken(chave, requisitor);
    const limite = Math.min(ATIVIDADES_POR_LOTE, LIMITE_POR_SINCRONIZACAO - inicio);
    const resposta = await listarAtividades(
      token,
      { inicio, limite, de: diaNoFuso(agora - dias * DIA_MS), ate: diaNoFuso(agora + DIA_MS) },
      requisitor,
    );
    const extraido = extrairItens(resposta);
    if (extraido.total > 0 && extraido.itens.length === 0) {
      logger.warn("Garmin: a listagem veio sem activityId reconhecível", {
        amostra: JSON.stringify(Array.isArray(resposta) ? resposta[0] : resposta)?.slice(0, 300),
      });
    }
    itens = extraido;
  } catch (err) {
    throw traduzirErro(err);
  }

  const idsExistentes = await db.getAll(...itens.itens.map((i) => db.doc(`atividades/${atividadeIdDoGarmin(i.id)}`)));
  const jaImportadas = new Set(idsExistentes.filter((d) => d.exists && d.get("userId") === uid).map((d) => d.id));

  for (const item of itens.itens) {
    const atividadeId = atividadeIdDoGarmin(item.id);
    if (jaImportadas.has(atividadeId)) {
      resultado.jaExistiam += 1;
      continue;
    }
    const caminho = caminhoDoArquivo(uid, atividadeId, "fit");
    const nomeDaAtividade = item.rotulo ?? `atividade ${item.id}`;
    try {
      const baixado = await baixarArquivoZip(token, item.id, requisitor);
      const fit = obterFit(baixado, TAMANHO_MAXIMO_BYTES);
      if (!fit) {
        logger.warn("Garmin: o download da atividade não trouxe um .fit utilizável", {
          atividadeId,
          conteudo: descreverDownload(baixado),
        });
        resultado.falhas += 1;
        resultado.problemas.push({
          atividade: nomeDaAtividade,
          motivo: "o Garmin não trouxe um arquivo .fit dela (comum em atividades criadas à mão ou sem sensores)",
        });
        continue;
      }
      await getStorage().bucket().file(caminho).save(fit, { resumable: false, contentType: "application/octet-stream" });
      const pedido: PedidoArquivo = { atividadeId, extensao: "fit", esporte: null, zona: null, fonte: FONTE_GARMIN };
      const r = await processarArquivo(uid, dataNascimento, pedido);
      if (r.jaExistia) resultado.jaExistiam += 1;
      else resultado.importadas += 1;
    } catch (err) {
      if (err instanceof HttpsError && err.code === "already-exists") {
        resultado.jaExistiam += 1; // a mesma atividade já foi enviada à mão
      } else if (err instanceof HttpsError && err.code === "failed-precondition" && (err.details as { codigo?: string })?.codigo === "sem-fc") {
        resultado.semFc += 1;
        resultado.problemas.push({ atividade: nomeDaAtividade, motivo: "não tem frequência cardíaca" });
        await getStorage().bucket().file(caminho).delete({ ignoreNotFound: true });
      } else {
        resultado.falhas += 1;
        resultado.problemas.push({ atividade: nomeDaAtividade, motivo: motivoDaFalha(err) });
        logger.error("Falha ao importar atividade do Garmin", { atividadeId, err });
        await getStorage().bucket().file(caminho).delete({ ignoreNotFound: true }).catch(() => undefined);
      }
    }
  }

  resultado.proximo = inicio + itens.total;
  resultado.terminou = itens.total < Math.min(ATIVIDADES_POR_LOTE, LIMITE_POR_SINCRONIZACAO - inicio);
  if (!resultado.terminou && resultado.proximo >= LIMITE_POR_SINCRONIZACAO) {
    resultado.terminou = true;
    resultado.limitado = true;
  }
  if (resultado.terminou) {
    await docChave(uid).set({ ultimaSincronizacao: FieldValue.serverTimestamp() }, { merge: true });
  }
  return resultado;
}

/** Motivo de uma falha, em português, para mostrar ao usuário (a causa técnica vai para o log). */
export function motivoDaFalha(err: unknown): string {
  if (err instanceof HttpsError) {
    const mensagem = err.message.replace(/\.$/, "");
    return mensagem.charAt(0).toLowerCase() + mensagem.slice(1);
  }
  if (err instanceof GarminErroApi) {
    return err.status === 0 ? "o Garmin não respondeu ao baixar o arquivo" : `o Garmin recusou o download (erro ${err.status})`;
  }
  return "erro inesperado ao ler o arquivo";
}

/** Identificador determinístico: sincronizar de novo a mesma atividade nunca a duplica. */
export function atividadeIdDoGarmin(idGarmin: string): string {
  return `garmin_${idGarmin}`;
}
