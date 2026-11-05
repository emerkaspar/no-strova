import { esporteDoArquivo } from "@no-strova/domain";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";
import { FONTE_STRAVA, gravarAtividade } from "../atividades/atividades.service";
import { criptografar, descriptografar } from "../garmin/garmin.cripto";
import { diasDaSincronizacao, posicao } from "../garmin/garmin.service";
import { exigirOutraFonteDesconectada } from "../sincronizacao/fonte";
import { ClienteStrava, extrairAtividades, seriesParaArquivo, StravaErroApi, type Tokens } from "./strava.cliente";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Atividades por chamada: uma de listagem e até uma de séries por atividade. */
export const ATIVIDADES_POR_LOTE = 10;
/** Menor que o do Garmin: o limite de leitura do Strava (200 a cada 15 min) é do app inteiro, somado entre os atletas. */
export const LIMITE_POR_SINCRONIZACAO = 100;
/** Renova o token quando faltar menos que isto para expirar. */
const FOLGA_DO_TOKEN_MS = 60 * 1000;

export interface SegredosStrava {
  /** Chave que cifra os tokens guardados (a mesma das chaves do Garmin). */
  cripto: string;
  clientId: string;
  clientSecret: string;
}

export interface SituacaoStrava {
  conectado: boolean;
  ultimaSincronizacao: string | null;
}

export interface ResultadoLote {
  importadas: number;
  jaExistiam: number;
  semFc: number;
  falhas: number;
  problemas: Array<{ atividade: string; motivo: string }>;
  proximo: number;
  terminou: boolean;
  limitado: boolean;
}

function docConexao(uid: string) {
  return db.doc(`users/${uid}/segredos/strava`);
}

export function atividadeIdDoStrava(idStrava: string): string {
  return `strava_${idStrava}`;
}

/** Traduz as falhas da API do Strava em mensagens para o usuário. */
export function traduzirErro(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof StravaErroApi) {
    if (err.status === 401 || err.status === 403 || err.status === 400) {
      // O corpo da resposta diz o motivo exato (permissão faltando, token inválido, app sem acesso…).
      logger.warn("O Strava recusou a requisição", { status: err.status, detalhe: err.detalhe });
      return new HttpsError(
        "failed-precondition",
        `O Strava recusou o acesso (erro ${err.status}): a conexão pode ter sido revogada, faltar a permissão de leitura das atividades ou o Strava pode estar exigindo assinatura. Conecte de novo; se repetir, avise o administrador.`,
        { codigo: "conexao-invalida" },
      );
    }
    if (err.status === 429) return erroDeLimite();
  }
  logger.error("Falha ao falar com o Strava", err);
  return new HttpsError("unavailable", "Não foi possível falar com o Strava agora. Tente novamente em instantes.");
}

function erroDeLimite(): HttpsError {
  return new HttpsError(
    "resource-exhausted",
    "O Strava limitou o número de consultas por alguns minutos. O que já foi importado foi mantido: tente de novo em cerca de 15 minutos.",
    { codigo: "limite-strava" },
  );
}

async function gravarTokens(uid: string, tokens: Tokens, cripto: string, extra: Record<string, unknown> = {}): Promise<void> {
  await docConexao(uid).set(
    {
      acessoCifrado: criptografar(tokens.accessToken, cripto),
      renovacaoCifrada: criptografar(tokens.refreshToken, cripto),
      acessoExpiraEm: Timestamp.fromMillis(tokens.expiraEmMs),
      ...(tokens.atletaId ? { atletaId: tokens.atletaId } : {}),
      ...extra,
    },
    { merge: true },
  );
}

export function validarCodigo(valor: unknown): string {
  const codigo = typeof valor === "string" ? valor.trim() : "";
  if (!/^[A-Za-z0-9]{10,200}$/.test(codigo)) {
    throw new HttpsError("invalid-argument", "O código de autorização do Strava é inválido. Tente conectar de novo.");
  }
  return codigo;
}

/** O Strava devolve os escopos concedidos na volta do redirecionamento (separados por vírgula). */
export function exigirEscopoDeLeitura(escopo: unknown): void {
  const concedidos = typeof escopo === "string" ? escopo.split(",") : [];
  if (!concedidos.some((e) => e === "activity:read" || e === "activity:read_all")) {
    throw new HttpsError(
      "invalid-argument",
      "Para sincronizar, o Strava precisa permitir a leitura das suas atividades. Conecte de novo e deixe essa opção marcada.",
    );
  }
}

export async function conectar(
  uid: string,
  codigoBruto: unknown,
  escopo: unknown,
  segredos: SegredosStrava,
  cliente: ClienteStrava = new ClienteStrava(),
): Promise<SituacaoStrava> {
  const codigo = validarCodigo(codigoBruto);
  exigirEscopoDeLeitura(escopo);
  await exigirOutraFonteDesconectada(uid, "strava");
  let tokens: Tokens;
  try {
    tokens = await cliente.trocarCodigo(segredos.clientId, segredos.clientSecret, codigo);
  } catch (err) {
    throw traduzirErro(err);
  }
  await gravarTokens(uid, tokens, segredos.cripto, { conectadoEm: FieldValue.serverTimestamp() });
  return situacao(uid);
}

export async function situacao(uid: string): Promise<SituacaoStrava> {
  const snap = await docConexao(uid).get();
  if (!snap.exists || typeof snap.get("renovacaoCifrada") !== "string") return { conectado: false, ultimaSincronizacao: null };
  const ultima = snap.get("ultimaSincronizacao");
  return { conectado: true, ultimaSincronizacao: ultima instanceof Timestamp ? ultima.toDate().toISOString() : null };
}

/** Token de acesso válido: o guardado, ou um novo pedido com o refresh token (que é regravado, pois o Strava pode trocá-lo). */
async function tokenDeAcesso(uid: string, dados: FirebaseFirestore.DocumentSnapshot, segredos: SegredosStrava, cliente: ClienteStrava): Promise<string> {
  const acessoCifrado = dados.get("acessoCifrado");
  const renovacaoCifrada = dados.get("renovacaoCifrada");
  if (typeof acessoCifrado !== "string" || typeof renovacaoCifrada !== "string") {
    throw new HttpsError("failed-precondition", "Conecte sua conta do Strava antes de sincronizar.");
  }
  try {
    const expira = dados.get("acessoExpiraEm");
    if (expira instanceof Timestamp && expira.toMillis() - FOLGA_DO_TOKEN_MS > Date.now()) {
      return descriptografar(acessoCifrado, segredos.cripto);
    }
    const novos = await cliente.renovar(segredos.clientId, segredos.clientSecret, descriptografar(renovacaoCifrada, segredos.cripto));
    await gravarTokens(uid, novos, segredos.cripto);
    return novos.accessToken;
  } catch (err) {
    if (err instanceof StravaErroApi) throw traduzirErro(err);
    logger.error("Não foi possível usar os tokens do Strava guardados", err);
    throw new HttpsError("failed-precondition", "Conecte sua conta do Strava de novo.", { codigo: "conexao-invalida" });
  }
}

export async function desconectar(uid: string, segredos: SegredosStrava, cliente: ClienteStrava = new ClienteStrava()): Promise<void> {
  const snap = await docConexao(uid).get();
  if (snap.exists) {
    try {
      await cliente.desautorizar(await tokenDeAcesso(uid, snap, segredos, cliente));
    } catch (err) {
      // Se o Strava já revogou a conexão, ou está fora do ar, apagar os tokens daqui continua sendo o certo.
      logger.warn("Não foi possível avisar o Strava da desconexão", err);
    }
  }
  await docConexao(uid).delete();
}

export function motivoDaFalha(err: unknown): string {
  if (err instanceof HttpsError) {
    const mensagem = err.message.replace(/\.$/, "");
    return mensagem.charAt(0).toLowerCase() + mensagem.slice(1);
  }
  if (err instanceof StravaErroApi) {
    if (err.status === 404) return "o Strava não tem dados de sensor para ela";
    return err.status === 0 ? "o Strava não respondeu ao buscar os dados" : `o Strava recusou a consulta (erro ${err.status})`;
  }
  return "erro inesperado ao ler os dados";
}

/**
 * Traz um lote de atividades do Strava: lista uma página, busca as séries de cada atividade nova e grava pelo mesmo
 * caminho do envio de arquivo. O app repete a chamada, com `proximo`, até `terminou`.
 */
export async function sincronizarLote(
  uid: string,
  dataNascimento: string | null,
  entrada: Record<string, unknown>,
  segredos: SegredosStrava,
  cliente: ClienteStrava = new ClienteStrava(),
): Promise<ResultadoLote> {
  const inicio = posicao(entrada.inicio);
  if (inicio % ATIVIDADES_POR_LOTE !== 0) throw new HttpsError("invalid-argument", "Posição inválida.");
  const agora = Date.now();

  const snap = await docConexao(uid).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Conecte sua conta do Strava antes de sincronizar.");
  const ultima = snap.get("ultimaSincronizacao");
  const dias = diasDaSincronizacao(entrada.dias, ultima instanceof Timestamp ? ultima.toMillis() : null, agora);

  const resultado: ResultadoLote = { importadas: 0, jaExistiam: 0, semFc: 0, falhas: 0, problemas: [], proximo: inicio, terminou: false, limitado: false };
  if (inicio >= LIMITE_POR_SINCRONIZACAO) return { ...resultado, terminou: true, limitado: true };

  const token = await tokenDeAcesso(uid, snap, segredos, cliente);
  let lista;
  try {
    lista = extrairAtividades(
      await cliente.listarAtividades(token, {
        depoisS: Math.floor((agora - dias * DIA_MS) / 1000),
        antesS: Math.floor((agora + DIA_MS) / 1000),
        pagina: inicio / ATIVIDADES_POR_LOTE + 1,
        porPagina: ATIVIDADES_POR_LOTE,
      }),
    );
  } catch (err) {
    throw traduzirErro(err);
  }

  const jaImportadas = new Set(
    (await db.getAll(...lista.itens.map((i) => db.doc(`atividades/${atividadeIdDoStrava(i.id)}`))))
      .filter((d) => d.exists && d.get("userId") === uid)
      .map((d) => d.id),
  );

  for (const item of lista.itens) {
    const atividadeId = atividadeIdDoStrava(item.id);
    if (jaImportadas.has(atividadeId)) {
      resultado.jaExistiam += 1;
      continue;
    }
    // O resumo já diz se há FC ou dados de sensor: nesses casos nem gasta uma consulta do limite do app.
    if (item.manual || item.inicioMs === null) {
      resultado.falhas += 1;
      resultado.problemas.push({ atividade: item.rotulo, motivo: "foi criada à mão no Strava, sem dados de sensor" });
      continue;
    }
    if (!item.temFc) {
      resultado.semFc += 1;
      resultado.problemas.push({ atividade: item.rotulo, motivo: "não tem frequência cardíaca" });
      continue;
    }
    if (cliente.pertoDoLimite()) throw erroDeLimite();

    try {
      const lido = seriesParaArquivo(await cliente.buscarSeries(token, item.id), item.inicioMs, item.sportType);
      if (!lido) {
        resultado.falhas += 1;
        resultado.problemas.push({ atividade: item.rotulo, motivo: "o Strava não trouxe a série de tempo dela" });
        continue;
      }
      await gravarAtividade(uid, dataNascimento, {
        atividadeId,
        lido,
        esporte: esporteDoArquivo(item.sportType),
        zona: null,
        hashArquivo: null,
        arquivoPath: null,
        extensao: null,
        fonte: FONTE_STRAVA,
      });
      resultado.importadas += 1;
    } catch (err) {
      if (err instanceof StravaErroApi && err.status === 429) throw erroDeLimite();
      if (err instanceof HttpsError && err.code === "already-exists") {
        resultado.jaExistiam += 1; // a mesma atividade já veio de outra fonte ou foi enviada à mão
      } else if (err instanceof HttpsError && err.code === "failed-precondition" && (err.details as { codigo?: string })?.codigo === "sem-fc") {
        resultado.semFc += 1;
        resultado.problemas.push({ atividade: item.rotulo, motivo: "não tem frequência cardíaca" });
      } else {
        resultado.falhas += 1;
        resultado.problemas.push({ atividade: item.rotulo, motivo: motivoDaFalha(err) });
        logger.error("Falha ao importar atividade do Strava", { atividadeId, err });
      }
    }
  }

  resultado.proximo = inicio + lista.total;
  resultado.terminou = lista.total < ATIVIDADES_POR_LOTE;
  if (!resultado.terminou && resultado.proximo >= LIMITE_POR_SINCRONIZACAO) {
    resultado.terminou = true;
    resultado.limitado = true;
  }
  if (resultado.terminou) {
    await docConexao(uid).set({ ultimaSincronizacao: FieldValue.serverTimestamp() }, { merge: true });
  }
  return resultado;
}
