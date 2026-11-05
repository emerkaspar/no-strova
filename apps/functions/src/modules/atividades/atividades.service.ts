import { createHash } from "node:crypto";
import {
  atividadePrecisaCompletar,
  avaliarTesteLthr,
  type ConfigAtleta,
  configVigenteEm,
  diaNoFuso,
  ESPORTES_VALIDOS,
  LIMITES_TRAJETO,
  esporteDoArquivo,
  melhoresEsforcos,
  reduzirSerieDetalhe,
  reduzirSerieFc,
  resumirAmostras,
  tempoNasZonasDaAtividade,
  validarAtividadeManual,
  validarConfigAtleta,
  validarFeedback,
  validarNomeDoTrajeto,
  VERSAO_DAS_ZONAS,
  VERSAO_DO_DETALHE,
  VERSAO_DOS_ESFORCOS,
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
/** Valor do campo `fonte` das atividades trazidas pela sincronização com o Garmin. */
export const FONTE_GARMIN = "garmin";
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
  if (agregado.data().count < LIMITE_CADASTROS_POR_DIA) return;
  // Atividades sincronizadas do Garmin têm limite próprio e não consomem a cota de quem cadastra à mão.
  const doDia = await db
    .collection("atividades")
    .where("userId", "==", uid)
    .where("criadoEm", ">=", inicioDoDia)
    .select("fonte")
    .get();
  if (doDia.docs.filter((d) => d.get("fonte") !== FONTE_GARMIN).length >= LIMITE_CADASTROS_POR_DIA) {
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

export interface PedidoArquivo {
  atividadeId: string;
  extensao: Extensao;
  esporte: string | null;
  zona: string | null;
  /** Origem externa do arquivo (sincronização); ela tem limite próprio e não consome a cota diária. */
  fonte?: typeof FONTE_GARMIN;
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

  if (!pedido.fonte) await exigirCotaDiaria(uid);

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

  const detalhe = reduzirSerieDetalhe(lido.amostras);
  const lote = db.batch();
  lote.create(ref, {
    userId: uid,
    origem: "arquivo",
    esporte,
    inicio,
    data,
    ...resumo,
    ...melhoresEsforcos(lido.amostras),
    melhoresEsforcosEm: VERSAO_DOS_ESFORCOS,
    detalheEm: VERSAO_DO_DETALHE,
    // tempo em cada zona de FC, pela configuração usada no HRSS (recalculado quando ela muda; ver calcularMelhoresEsforcosDoUsuario)
    tempoZonasS: tempoNasZonasDaAtividade(detalhe, config),
    zonasEm: VERSAO_DAS_ZONAS,
    zonasConfigId: estresse.configIdUsada ?? null,
    zona,
    ...calorias,
    ...estresse,
    arquivoPath: arquivo.name,
    extensao: pedido.extensao,
    hashArquivo,
    ...(pedido.fonte ? { fonte: pedido.fonte } : {}),
    criadoEm: FieldValue.serverTimestamp(),
  });
  const serie = reduzirSerieFc(lido.amostras);
  if (serie.fc.length > 0) {
    lote.set(ref.collection("series").doc("fc"), { passoS: 5, ...serie });
  }
  if (detalhe) lote.set(ref.collection("series").doc("detalhe"), detalhe);
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

const TITULO_MAX = 80;

/** Limpa e valida o título (texto livre, até ${TITULO_MAX} caracteres). Vazio significa "sem título". */
function tituloLimpo(titulo: unknown): string {
  if (titulo !== undefined && titulo !== null && typeof titulo !== "string") {
    throw new HttpsError("invalid-argument", "O título deve ser um texto.");
  }
  const limpo = (titulo ?? "").replace(/\s+/g, " ").trim();
  if (limpo.length > TITULO_MAX) {
    throw new HttpsError("invalid-argument", `O título pode ter no máximo ${TITULO_MAX} caracteres.`);
  }
  return limpo;
}

/** Define o título da atividade. Vazio remove o título e volta ao nome padrão. */
export async function renomearAtividade(uid: string, atividadeId: string, titulo: unknown): Promise<string | null> {
  const limpo = tituloLimpo(titulo);
  const { ref } = await atividadeDoDono(uid, atividadeId);
  await ref.update({ titulo: limpo === "" ? FieldValue.delete() : limpo });
  return limpo === "" ? null : limpo;
}

const TRAJETOS = "trajetos";

/**
 * Resolve o trajeto pedido para o id de um documento de `trajetos`: `{ id }` confere o dono e o esporte; `{ nome }`
 * reaproveita o trajeto de mesmo nome (sem acento nem caixa) no esporte ou cria um novo.
 */
async function resolverTrajeto(uid: string, esporte: string, pedido: unknown): Promise<{ id: string; nome: string }> {
  if (typeof pedido !== "object" || pedido === null || Array.isArray(pedido)) {
    throw new HttpsError("invalid-argument", "Trajeto inválido.");
  }
  const { id, nome } = pedido as { id?: unknown; nome?: unknown };

  if (id !== undefined) {
    if (typeof id !== "string" || id.length < 5 || id.length > 40 || id.includes("/")) {
      throw new HttpsError("invalid-argument", "Trajeto inválido.");
    }
    const snap = await db.doc(`${TRAJETOS}/${id}`).get();
    if (!snap.exists || snap.get("userId") !== uid) throw new HttpsError("not-found", "Trajeto não encontrado.");
    if (snap.get("esporte") !== esporte) {
      throw new HttpsError("failed-precondition", "Esse trajeto é de outro esporte.");
    }
    return { id, nome: String(snap.get("nome")) };
  }

  const r = validarNomeDoTrajeto(nome);
  if (!r.valido || !r.valores) throw new HttpsError("invalid-argument", r.erros.join(" "));
  const { nome: nomeLimpo, chave } = r.valores;
  const colecao = db.collection(TRAJETOS);
  const igual = await colecao.where("userId", "==", uid).where("esporte", "==", esporte).where("chave", "==", chave).limit(1).get();
  if (!igual.empty) return { id: igual.docs[0].id, nome: String(igual.docs[0].get("nome")) };

  const total = (await colecao.where("userId", "==", uid).count().get()).data().count;
  if (total >= LIMITES_TRAJETO.porUsuario) {
    throw new HttpsError("failed-precondition", `Você já tem ${LIMITES_TRAJETO.porUsuario} trajetos. Reaproveite um dos existentes.`);
  }
  const ref = colecao.doc();
  await ref.create({ userId: uid, nome: nomeLimpo, chave, esporte, criadoEm: FieldValue.serverTimestamp() });
  return { id: ref.id, nome: nomeLimpo };
}

export interface EdicaoSalva {
  titulo: string | null;
  esporte: string;
  feedback: Record<string, unknown> | null;
  testeLthr: boolean;
  trajeto: { id: string; nome: string } | null;
}

/**
 * Salva a edição feita no modal "Como foi?": título, esporte, feedback, marca de teste de LTHR e trajeto de treino.
 * Cada campo só muda se vier no pedido (`feedback: null`, `testeLthr: false` e `trajeto: null` removem). Os dados medidos
 * (distância, duração, FC) nunca são alterados aqui. Trocar o esporte não refaz o HRSS nem o tempo em movimento, que já
 * foram calculados na importação, mas solta o trajeto se ele era de outro esporte.
 */
export async function salvarEdicaoDaAtividade(uid: string, atividadeId: string, dados: Record<string, unknown>): Promise<EdicaoSalva> {
  const { ref, snap } = await atividadeDoDono(uid, atividadeId);
  const alteracoes: Record<string, unknown> = {};

  if ("titulo" in dados) {
    const limpo = tituloLimpo(dados.titulo);
    alteracoes.titulo = limpo === "" ? FieldValue.delete() : limpo;
  }
  let esporte = String(snap.get("esporte"));
  if ("esporte" in dados) {
    if (typeof dados.esporte !== "string" || !(ESPORTES_VALIDOS as readonly string[]).includes(dados.esporte)) {
      throw new HttpsError("invalid-argument", "Esporte inválido.");
    }
    esporte = dados.esporte;
    alteracoes.esporte = esporte;
  }
  let feedback: Record<string, unknown> | null | undefined;
  if ("feedback" in dados) {
    if (dados.feedback === null) {
      feedback = null;
      alteracoes.feedback = FieldValue.delete();
    } else {
      const r = validarFeedback(dados.feedback);
      if (!r.valido || !r.valores) throw new HttpsError("invalid-argument", r.erros.join(" "));
      const v = r.valores;
      feedback = { sensacao: v.sensacao, etiquetas: v.etiquetas, ...(v.rpe !== null ? { rpe: v.rpe } : {}), ...(v.dor !== null ? { dor: v.dor } : {}), ...(v.notas !== null ? { notas: v.notas } : {}) };
      alteracoes.feedback = { ...feedback, registradoEm: FieldValue.serverTimestamp() };
    }
  }
  if ("testeLthr" in dados) {
    if (typeof dados.testeLthr !== "boolean") throw new HttpsError("invalid-argument", "Marcação de teste inválida.");
    if (dados.testeLthr) {
      const avaliacao = avaliarTesteLthr({ origem: snap.get("origem"), fcMedia: snap.get("fcMedia"), duracaoS: snap.get("duracaoS") });
      if (!avaliacao.elegivel) throw new HttpsError("failed-precondition", avaliacao.motivo ?? "Esta atividade não serve como teste de LTHR.");
      alteracoes.testeLthr = true;
    } else {
      alteracoes.testeLthr = FieldValue.delete();
    }
  }

  let trajeto: { id: string; nome: string } | null | undefined;
  if ("trajeto" in dados) {
    if (dados.trajeto === null) {
      trajeto = null;
      alteracoes.trajetoId = FieldValue.delete();
    } else {
      trajeto = await resolverTrajeto(uid, esporte, dados.trajeto);
      alteracoes.trajetoId = trajeto.id;
    }
  } else if ("esporte" in dados && typeof snap.get("trajetoId") === "string") {
    // o trajeto é de um esporte só: se a atividade mudou de esporte, a ligação sai
    const atual = await db.doc(`${TRAJETOS}/${snap.get("trajetoId")}`).get();
    if (!atual.exists || atual.get("esporte") !== esporte) {
      trajeto = null;
      alteracoes.trajetoId = FieldValue.delete();
    }
  }
  if (Object.keys(alteracoes).length === 0) throw new HttpsError("invalid-argument", "Nada para salvar.");

  await ref.update(alteracoes);
  const atual = (await ref.get()).data() ?? {};
  let trajetoFinal: { id: string; nome: string } | null = null;
  if (trajeto !== undefined) trajetoFinal = trajeto;
  else if (typeof atual.trajetoId === "string") {
    const doc = await db.doc(`${TRAJETOS}/${atual.trajetoId}`).get();
    trajetoFinal = doc.exists ? { id: doc.id, nome: String(doc.get("nome")) } : null;
  }
  return {
    titulo: typeof atual.titulo === "string" ? atual.titulo : null,
    esporte: String(atual.esporte),
    feedback: feedback === undefined ? (atual.feedback ?? null) : feedback,
    testeLthr: atual.testeLthr === true,
    trajeto: trajetoFinal,
  };
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

/**
 * Completa o que se deriva do arquivo das atividades importadas: os melhores esforços (1, 5, 10, 20, 21 e 40 km), a série
 * detalhada e o tempo em cada zona de FC. Relê o arquivo original no Storage quando faltam esforços ou série; se só faltam as
 * zonas (por exemplo, depois de recalcular o histórico com outro LTHR), usa a série já guardada, sem reler o arquivo.
 * Processa até `limite` atividades por chamada (o app chama de novo até `restantes` chegar a zero). Um arquivo que não pode
 * ser lido é marcado como calculado (sem tempos) para não travar a fila.
 */
export async function calcularMelhoresEsforcosDoUsuario(
  uid: string,
  prioritaria: string | null = null,
  limite = 25,
): Promise<{ processadas: number; restantes: number }> {
  const snap = await db.collection("atividades").where("userId", "==", uid).limit(5000).get();
  const pendentes = snap.docs.filter((d) => {
    const a = d.data();
    const temArquivo = typeof a.arquivoPath === "string" && a.arquivoPath.startsWith(`atividades/${uid}/`);
    return temArquivo && atividadePrecisaCompletar(a, { versaoDosEsforcos: VERSAO_DOS_ESFORCOS, versaoDoDetalhe: VERSAO_DO_DETALHE });
  });
  const configs = await carregarConfigs(uid);
  // a atividade que o usuário está vendo vai primeiro
  pendentes.sort((x, y) => Number(y.id === prioritaria) - Number(x.id === prioritaria));
  let processadas = 0;
  for (const doc of pendentes.slice(0, limite)) {
    const a = doc.data();
    const precisaDoArquivo = a.melhoresEsforcosEm !== VERSAO_DOS_ESFORCOS || a.detalheEm !== VERSAO_DO_DETALHE;
    let tempos: ReturnType<typeof melhoresEsforcos> | null = null;
    let detalhe: ReturnType<typeof reduzirSerieDetalhe> = null;
    if (precisaDoArquivo) {
      try {
        const [conteudo] = await getStorage().bucket().file(a.arquivoPath as string).download();
        const lido = await lerArquivo(conteudo, a.extensao as Extensao);
        tempos = melhoresEsforcos(lido.amostras);
        detalhe = reduzirSerieDetalhe(lido.amostras);
      } catch (err) {
        logger.warn("Não foi possível reler o arquivo de uma atividade", { atividadeId: doc.id, erro: String(err) });
      }
    } else {
      // só faltam as zonas: a série detalhada já está guardada
      const guardada = await doc.ref.collection("series").doc("detalhe").get();
      detalhe = guardada.exists ? (guardada.data() as ReturnType<typeof reduzirSerieDetalhe>) : null;
    }
    // zonas pela configuração que gerou o HRSS da atividade (a mesma do detalhe); sem ela, sem zonas
    const configDoHrss = typeof a.configIdUsada === "string" ? (configs.find((c) => c.id === a.configIdUsada) ?? null) : null;
    const lote = db.batch();
    if (detalhe && precisaDoArquivo) lote.set(doc.ref.collection("series").doc("detalhe"), detalhe);
    // arquivo ilegível: marca como calculado, sem apagar tempos que já existiam
    const semTempos = { melhor1kS: null, melhor5kS: null, melhor10kS: null, melhor20kS: null, melhor21kS: null, melhor40kS: null };
    const novosTempos = tempos ?? (a.melhoresEsforcosEm === VERSAO_DOS_ESFORCOS ? {} : semTempos);
    lote.update(doc.ref, {
      ...novosTempos,
      melhoresEsforcosEm: VERSAO_DOS_ESFORCOS,
      detalheEm: VERSAO_DO_DETALHE,
      tempoZonasS: tempoNasZonasDaAtividade(detalhe, configDoHrss),
      zonasEm: VERSAO_DAS_ZONAS,
      zonasConfigId: a.configIdUsada ?? null,
    });
    await lote.commit();
    processadas += 1;
  }
  return { processadas, restantes: Math.max(0, pendentes.length - processadas) };
}
