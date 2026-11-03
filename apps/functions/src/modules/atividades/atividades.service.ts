import { createHash } from "node:crypto";
import {
  type ConfigAtleta,
  configVigenteEm,
  diaNoFuso,
  ESPORTES_VALIDOS,
  esporteDoArquivo,
  reduzirSerieFc,
  resumirAmostras,
  validarAtividadeManual,
  validarConfigAtleta,
  ZONAS,
} from "@no-strova/domain";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";
import { ALERTAS, type ResultadoProcessamento } from "./atividades.types";
import { calcularCalorias, calcularEstresse } from "./estresse";
import { ArquivoInvalidoError, type Extensao, lerArquivo } from "./parsers";

export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
/** Limite de atividades criadas por usuário por dia (arquivo + manual), contra abuso. */
export const LIMITE_CADASTROS_POR_DIA = 30;
const ID_ATIVIDADE = /^[A-Za-z0-9_-]{8,40}$/;
const ZONAS_VALIDAS = Object.keys(ZONAS);

export function validarIdAtividade(valor: unknown): string {
  if (typeof valor !== "string" || !ID_ATIVIDADE.test(valor)) {
    throw new HttpsError("invalid-argument", "Identificador de atividade inválido.");
  }
  return valor;
}

export function caminhoDoArquivo(uid: string, atividadeId: string, extensao: Extensao): string {
  return `atividades/${uid}/${atividadeId}/original.${extensao}`;
}

/** Configurações do atleta válidas. Os dados são escritos pelo próprio usuário, então são revalidados aqui. */
export async function carregarConfigs(uid: string): Promise<ConfigAtleta[]> {
  const snap = await db.collection("configsAtleta").where("userId", "==", uid).get();
  const configs: ConfigAtleta[] = [];
  for (const doc of snap.docs) {
    const r = validarConfigAtleta(doc.data());
    if (r.valido && r.valores) configs.push({ id: doc.id, ...r.valores });
  }
  return configs;
}

async function exigirCotaDiaria(uid: string): Promise<void> {
  const inicioDoDia = Timestamp.fromDate(new Date(`${diaNoFuso(Date.now())}T00:00:00-03:00`));
  const agregado = await db
    .collection("atividades")
    .where("userId", "==", uid)
    .where("criadoEm", ">=", inicioDoDia)
    .count()
    .get();
  if (agregado.data().count >= LIMITE_CADASTROS_POR_DIA) {
    throw new HttpsError(
      "resource-exhausted",
      `Limite de ${LIMITE_CADASTROS_POR_DIA} atividades por dia atingido. Tente novamente amanhã.`,
    );
  }
}

function zonaOpcional(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string" || !ZONAS_VALIDAS.includes(valor)) {
    throw new HttpsError("invalid-argument", "Zona inválida.");
  }
  return valor;
}

function esporteOpcional(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string" || !(ESPORTES_VALIDOS as readonly string[]).includes(valor)) {
    throw new HttpsError("invalid-argument", "Esporte inválido.");
  }
  return valor;
}

interface PedidoArquivo {
  atividadeId: string;
  extensao: Extensao;
  esporte: string | null;
  zona: string | null;
}

export function lerPedidoArquivo(dados: Record<string, unknown>, extensao: Extensao): PedidoArquivo {
  return {
    atividadeId: validarIdAtividade(dados.atividadeId),
    extensao,
    esporte: esporteOpcional(dados.esporte),
    zona: zonaOpcional(dados.zona),
  };
}

/**
 * Processa um arquivo já enviado ao Storage: valida o conteúdo, rejeita duplicatas, calcula o
 * resumo e o HRSS (pela configuração vigente na data) e grava a atividade. Arquivo inválido ou
 * duplicado é apagado do Storage.
 */
export async function processarArquivo(
  uid: string,
  dataNascimento: string | null,
  pedido: PedidoArquivo,
): Promise<ResultadoProcessamento> {
  const ref = db.doc(`atividades/${pedido.atividadeId}`);
  const existente = await ref.get();
  if (existente.exists) {
    if (existente.get("userId") !== uid) {
      throw new HttpsError("already-exists", "Identificador de atividade já utilizado.");
    }
    return {
      atividadeId: pedido.atividadeId,
      hrss: existente.get("hrss") ?? null,
      alertas: existente.get("alertas") ?? [],
      jaExistia: true,
    };
  }

  const arquivo = getStorage().bucket().file(caminhoDoArquivo(uid, pedido.atividadeId, pedido.extensao));
  const [existe] = await arquivo.exists();
  if (!existe) {
    throw new HttpsError("not-found", "Arquivo não encontrado. Envie o arquivo novamente.");
  }
  const rejeitar = async (codigo: "invalid-argument" | "already-exists", mensagem: string): Promise<never> => {
    await arquivo.delete({ ignoreNotFound: true });
    throw new HttpsError(codigo, mensagem);
  };

  const [metadados] = await arquivo.getMetadata();
  const tamanho = Number(metadados.size);
  if (!(tamanho > 0) || tamanho > TAMANHO_MAXIMO_BYTES) {
    return rejeitar("invalid-argument", "O arquivo está vazio ou passa do limite de 15 MB.");
  }

  await exigirCotaDiaria(uid);

  const [conteudo] = await arquivo.download();
  const hashArquivo = createHash("sha256").update(conteudo).digest("hex");

  let lido;
  try {
    lido = await lerArquivo(conteudo, pedido.extensao);
  } catch (err) {
    if (err instanceof ArquivoInvalidoError) return rejeitar("invalid-argument", err.message);
    throw err;
  }

  const esporte = pedido.esporte ?? esporteDoArquivo(lido.esporteArquivo);
  const resumo = resumirAmostras(lido.amostras, esporte);
  if (!resumo) {
    return rejeitar("invalid-argument", "O arquivo não tem dados suficientes para formar uma atividade.");
  }

  const colecao = db.collection("atividades");
  const inicio = Timestamp.fromMillis(lido.inicioMs);
  const duplicadaPorHash = await colecao.where("userId", "==", uid).where("hashArquivo", "==", hashArquivo).limit(1).get();
  const duplicadaPorInicio = await colecao
    .where("userId", "==", uid)
    .where("inicio", "==", inicio)
    .where("duracaoS", "==", resumo.duracaoS)
    .limit(1)
    .get();
  if (!duplicadaPorHash.empty || !duplicadaPorInicio.empty) {
    return rejeitar("already-exists", "Esta atividade já foi importada (mesmo arquivo ou mesmo início e duração).");
  }

  const data = diaNoFuso(lido.inicioMs);
  const zona = pedido.zona;
  if (resumo.fcMedia === null && zona === null) {
    // O arquivo é mantido: o cliente reenvia o pedido com a zona predominante.
    throw new HttpsError(
      "failed-precondition",
      "O arquivo não tem frequência cardíaca. Informe a zona predominante do treino para estimar o estresse.",
      { codigo: "sem-fc" },
    );
  }

  const config = configVigenteEm(await carregarConfigs(uid), data);
  const estresse = calcularEstresse({
    data,
    fcMedia: resumo.fcMedia,
    fcMax: resumo.fcMax,
    zona,
    hrssManual: null,
    tempoMovimentoS: resumo.tempoMovimentoS,
    config,
  });
  const calorias = calcularCalorias({
    data,
    fcMedia: resumo.fcMedia,
    zona,
    duracaoS: resumo.duracaoS,
    config,
    dataNascimento,
    caloriasDoArquivo: lido.calorias,
    caloriasInformadas: null,
  });

  const lote = db.batch();
  lote.create(ref, {
    userId: uid,
    origem: "arquivo",
    esporte,
    inicio,
    data,
    ...resumo,
    zona,
    ...calorias,
    ...estresse,
    arquivoPath: arquivo.name,
    extensao: pedido.extensao,
    hashArquivo,
    criadoEm: FieldValue.serverTimestamp(),
  });
  const serie = reduzirSerieFc(lido.amostras);
  if (serie.fc.length > 0) {
    lote.set(ref.collection("series").doc("fc"), { passoS: 5, ...serie });
  }
  await lote.commit();

  return { atividadeId: pedido.atividadeId, hrss: estresse.hrss, alertas: estresse.alertas, jaExistia: false };
}

export async function criarManual(
  uid: string,
  dataNascimento: string | null,
  entrada: Record<string, unknown>,
): Promise<ResultadoProcessamento> {
  const r = validarAtividadeManual(entrada, ZONAS_VALIDAS);
  if (!r.valido || !r.valores) throw new HttpsError("invalid-argument", r.erros.join(" "));
  const v = r.valores;

  await exigirCotaDiaria(uid);

  const config = configVigenteEm(await carregarConfigs(uid), v.data);
  const estresse = calcularEstresse({
    data: v.data,
    fcMedia: v.fcMedia,
    fcMax: null,
    zona: v.zona,
    hrssManual: v.hrssManual,
    tempoMovimentoS: v.duracaoS,
    config,
  });
  const calorias = calcularCalorias({
    data: v.data,
    fcMedia: v.fcMedia,
    zona: v.zona,
    duracaoS: v.duracaoS,
    config,
    dataNascimento,
    caloriasDoArquivo: null,
    caloriasInformadas: v.calorias,
  });

  const ref = db.collection("atividades").doc();
  await ref.create({
    userId: uid,
    origem: "manual",
    esporte: v.esporte,
    inicio: Timestamp.fromDate(new Date(`${v.data}T${v.horaInicio}:00-03:00`)),
    data: v.data,
    duracaoS: v.duracaoS,
    tempoMovimentoS: v.duracaoS,
    distanciaM: v.distanciaM,
    altimetriaM: v.altimetriaM,
    fcMedia: v.fcMedia,
    fcMax: null,
    zona: v.zona,
    ...calorias,
    ...estresse,
    arquivoPath: null,
    extensao: null,
    hashArquivo: null,
    criadoEm: FieldValue.serverTimestamp(),
  });
  return { atividadeId: ref.id, hrss: estresse.hrss, alertas: estresse.alertas, jaExistia: false };
}

async function atividadeDoDono(uid: string, atividadeId: string) {
  const ref = db.doc(`atividades/${atividadeId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("userId") !== uid) {
    throw new HttpsError("not-found", "Atividade não encontrada.");
  }
  return { ref, snap };
}

export async function excluirAtividade(uid: string, atividadeId: string): Promise<void> {
  const { ref, snap } = await atividadeDoDono(uid, atividadeId);
  const caminho = snap.get("arquivoPath");
  for (const sub of await ref.collection("series").listDocuments()) await sub.delete();
  await ref.delete();
  if (typeof caminho === "string" && caminho.startsWith(`atividades/${uid}/`)) {
    await getStorage().bucket().file(caminho).delete({ ignoreNotFound: true });
  }
}

/** URL assinada de curta duração para baixar o arquivo original (o Storage nega leitura direta). */
export async function urlDoArquivo(uid: string, atividadeId: string): Promise<string> {
  const { snap } = await atividadeDoDono(uid, atividadeId);
  const caminho = snap.get("arquivoPath");
  if (typeof caminho !== "string" || !caminho.startsWith(`atividades/${uid}/`)) {
    throw new HttpsError("failed-precondition", "Esta atividade não tem arquivo original.");
  }
  try {
    const [url] = await getStorage()
      .bucket()
      .file(caminho)
      .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
    return url;
  } catch (err) {
    // Causa provável: a conta de serviço sem permissão de assinar (iam.serviceAccounts.signBlob).
    logger.error("Falha ao gerar a URL assinada do arquivo", err);
    throw new HttpsError("internal", "Não foi possível gerar o link de download. Tente novamente.");
  }
}

/**
 * Recalcula HRSS (e calorias estimadas) de todas as atividades do usuário pela configuração
 * vigente na data de cada uma. Estresse informado manualmente nunca é alterado.
 */
export async function recalcularHistorico(
  uid: string,
  dataNascimento: string | null,
): Promise<{ total: number; atualizadas: number; semConfig: number }> {
  const configs = await carregarConfigs(uid);
  const snap = await db.collection("atividades").where("userId", "==", uid).limit(5000).get();

  let atualizadas = 0;
  let semConfig = 0;
  let lote = db.batch();
  let pendentes = 0;
  for (const doc of snap.docs) {
    const a = doc.data();
    if (a.hrssOrigem === "manual") continue;

    const config = configVigenteEm(configs, a.data);
    const estresse = calcularEstresse({
      data: a.data,
      fcMedia: a.fcMedia ?? null,
      fcMax: a.fcMax ?? null,
      zona: a.zona ?? null,
      hrssManual: null,
      tempoMovimentoS: a.tempoMovimentoS ?? a.duracaoS,
      config,
    });
    if (estresse.alertas.includes(ALERTAS.SEM_CONFIG)) semConfig += 1;
    const alteracoes: Record<string, unknown> = { ...estresse };
    if (a.caloriasOrigem === "estimada" || a.caloriasOrigem === null || a.caloriasOrigem === undefined) {
      Object.assign(
        alteracoes,
        calcularCalorias({
          data: a.data,
          fcMedia: a.fcMedia ?? null,
          zona: a.zona ?? null,
          duracaoS: a.duracaoS,
          config,
          dataNascimento,
          caloriasDoArquivo: null,
          caloriasInformadas: null,
        }),
      );
    }

    const mudou =
      a.hrss !== estresse.hrss ||
      a.configIdUsada !== estresse.configIdUsada ||
      ("calorias" in alteracoes && a.calorias !== alteracoes.calorias);
    if (!mudou) continue;

    lote.update(doc.ref, alteracoes);
    atualizadas += 1;
    pendentes += 1;
    if (pendentes === 400) {
      await lote.commit();
      lote = db.batch();
      pendentes = 0;
    }
  }
  if (pendentes > 0) await lote.commit();
  return { total: snap.size, atualizadas, semConfig };
}
