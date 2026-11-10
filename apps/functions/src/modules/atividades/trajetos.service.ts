import {
  acharTrechosNaSerie,
  type ConfigAtleta,
  resumoDoTrechoDoTrajeto,
  rotaDeReferencia,
  rotaValida,
  trechoPorDistancia,
} from "@no-strova/domain";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../shared/firebase";

/**
 * Trecho do trajeto nas atividades: a parte da atividade que acompanha a rota de referência do trajeto. A detecção roda aqui,
 * uma vez, quando a atividade é ligada a um trajeto ou quando a rota do trajeto muda, e o resultado fica gravado na
 * atividade (`trajetoTrecho`); a tela nunca refaz a conta. Veja packages/domain/src/trechoDoTrajeto.js.
 */

const TRAJETOS = "trajetos";
const ID = /^[A-Za-z0-9_-]{5,40}$/;
/** Atividades lidas de uma vez (db.getAll) ao refazer o trecho de um trajeto. */
const LEITURA_EM_LOTE = 50;
const ESCRITA_EM_LOTE = 400;

export interface Rota {
  lat: number[];
  lon: number[];
  comprimentoM: number;
}

type Serie = NonNullable<Parameters<typeof acharTrechosNaSerie>[0]>;
type TrechoGravado = Record<string, unknown>;

function idValido(valor: unknown, rotulo: string): string {
  if (typeof valor !== "string" || !ID.test(valor)) throw new HttpsError("invalid-argument", `${rotulo} inválido.`);
  return valor;
}

function numeroOuNulo(valor: unknown, rotulo: string): number | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 1_000_000) {
    throw new HttpsError("invalid-argument", `${rotulo} inválido.`);
  }
  return valor;
}

/** Rota de referência do trajeto, ou null se ele ainda não tem (ou se o que está guardado não vale). */
export function rotaDoDocumento(dados: FirebaseFirestore.DocumentData | undefined): Rota | null {
  const rota = dados?.rota;
  return rotaValida(rota) ? (rota as Rota) : null;
}

/** Série detalhada guardada da atividade (com GPS), ou null. */
async function serieDaAtividade(ref: FirebaseFirestore.DocumentReference): Promise<Serie | null> {
  const doc = await ref.collection("series").doc("detalhe").get();
  return doc.exists ? (doc.data() as Serie) : null;
}

/** Configuração de FC que gerou o HRSS da atividade (a mesma das zonas dela). */
function configDasZonas(configs: ConfigAtleta[], atividade: FirebaseFirestore.DocumentData): ConfigAtleta | null {
  return typeof atividade.configIdUsada === "string" ? (configs.find((c) => c.id === atividade.configIdUsada) ?? null) : null;
}

/** O que se grava na atividade: o trecho (primeira passagem pelo trajeto) e as voltas seguintes, se houver. */
export interface TrechosDetectados {
  trecho: TrechoGravado | null;
  voltas: TrechoGravado[];
}

const SEM_TRECHO: TrechosDetectados = { trecho: null, voltas: [] };

/**
 * Detecta na série todas as passagens pelo trajeto (uma por volta). A primeira vai em `trecho` e as demais em `voltas`;
 * sem correspondência, `trecho` é null.
 */
function detectar(serie: Serie | null, rota: Rota, atividade: FirebaseFirestore.DocumentData, configs: ConfigAtleta[]): TrechosDetectados {
  if (!serie) return SEM_TRECHO;
  const zonas = configDasZonas(configs, atividade);
  const resumos = acharTrechosNaSerie(serie, rota)
    .map((achado) => resumoDoTrechoDoTrajeto(serie, achado, String(atividade.esporte), "auto", zonas))
    .filter((r): r is Record<string, unknown> => r !== null);
  return resumos.length === 0 ? SEM_TRECHO : { trecho: resumos[0], voltas: resumos.slice(1) };
}

/** Campos de trecho a gravar na atividade (`trajetoVoltas` só existe quando há mais de uma passagem). */
function camposDoTrecho(achado: TrechosDetectados): Record<string, unknown> {
  return {
    trajetoTrecho: achado.trecho ?? FieldValue.delete(),
    trajetoVoltas: achado.voltas.length > 0 ? achado.voltas : FieldValue.delete(),
  };
}

/**
 * Trecho para uma atividade que acabou de ser ligada a um trajeto (usado ao salvar o "Como foi?").
 * @returns os campos de trecho prontos para gravar (`trajetoTrecho` e `trajetoVoltas`; `FieldValue.delete()` quando não há)
 */
export async function trechoParaAtividadeNova(
  atividade: FirebaseFirestore.DocumentSnapshot,
  trajetoId: string,
  configs: () => Promise<ConfigAtleta[]>,
): Promise<Record<string, unknown>> {
  const trajeto = await db.doc(`${TRAJETOS}/${trajetoId}`).get();
  const rota = rotaDoDocumento(trajeto.data());
  if (!rota) return camposDoTrecho(SEM_TRECHO);
  const serie = await serieDaAtividade(atividade.ref);
  if (!serie) return camposDoTrecho(SEM_TRECHO);
  return camposDoTrecho(detectar(serie, rota, atividade.data() ?? {}, await configs()));
}

export interface ResultadoDaRota {
  total: number;
  comTrecho: number;
  /** Passagens pelo trajeto achadas além da primeira de cada atividade (voltas). */
  voltas: number;
  semGps: number;
  semCorrespondencia: number;
  preservadas: number;
}

/**
 * Define a rota de referência do trajeto a partir de uma atividade (inteira ou só da faixa `iniM`..`fimM`, em metros) e
 * refaz o trecho de todas as atividades do trajeto. As que o usuário ajustou à mão (`manual` ou `inteira`) ficam como estão.
 */
export async function definirRotaDoTrajeto(
  uid: string,
  dados: Record<string, unknown>,
  carregarConfigs: () => Promise<ConfigAtleta[]>,
): Promise<ResultadoDaRota & { rota: Rota }> {
  const trajetoId = idValido(dados.trajetoId, "Trajeto");
  const atividadeId = idValido(dados.atividadeId, "Atividade");
  const iniM = numeroOuNulo(dados.iniM, "Início do trecho");
  const fimM = numeroOuNulo(dados.fimM, "Fim do trecho");
  if ((iniM === null) !== (fimM === null)) throw new HttpsError("invalid-argument", "Informe o início e o fim do trecho.");

  const trajetoRef = db.doc(`${TRAJETOS}/${trajetoId}`);
  const trajeto = await trajetoRef.get();
  if (!trajeto.exists || trajeto.get("userId") !== uid) throw new HttpsError("not-found", "Trajeto não encontrado.");
  const atividade = await db.doc(`atividades/${atividadeId}`).get();
  if (!atividade.exists || atividade.get("userId") !== uid) throw new HttpsError("not-found", "Atividade não encontrada.");
  if (atividade.get("esporte") !== trajeto.get("esporte")) {
    throw new HttpsError("failed-precondition", "A atividade é de outro esporte.");
  }

  const serie = await serieDaAtividade(atividade.ref);
  if (!serie?.lat) throw new HttpsError("failed-precondition", "Esta atividade não tem GPS para servir de referência.");

  let i0 = 0;
  let i1 = serie.t.length - 1;
  if (iniM !== null && fimM !== null) {
    const faixa = trechoPorDistancia(serie, iniM, fimM);
    if (!faixa) throw new HttpsError("invalid-argument", "Esse trecho não existe na atividade. Confira o início e o fim.");
    ({ i0, i1 } = faixa);
  }
  const rota = rotaDeReferencia(serie, i0, i1);
  if (!rota) {
    throw new HttpsError("failed-precondition", "Essa parte da atividade não tem GPS suficiente ou é curta demais (mínimo de 200 m).");
  }

  await trajetoRef.update({
    rota,
    rotaAtividadeId: atividadeId,
    rotaIniM: iniM ?? FieldValue.delete(),
    rotaFimM: fimM ?? FieldValue.delete(),
    rotaEm: FieldValue.serverTimestamp(),
  });
  return { ...(await refazerTrechos(uid, trajetoId, rota, await carregarConfigs())), rota };
}

/** Refaz o trecho de todas as atividades do trajeto com a rota dada. Só grava o que mudou (cada gravação acorda o gatilho de estresse). */
async function refazerTrechos(uid: string, trajetoId: string, rota: Rota, configs: ConfigAtleta[]): Promise<ResultadoDaRota> {
  const snap = await db.collection("atividades").where("userId", "==", uid).where("trajetoId", "==", trajetoId).get();
  const resultado: ResultadoDaRota = { total: snap.size, comTrecho: 0, voltas: 0, semGps: 0, semCorrespondencia: 0, preservadas: 0 };

  const alteracoes: Array<{ ref: FirebaseFirestore.DocumentReference; achado: TrechosDetectados }> = [];
  for (let i = 0; i < snap.docs.length; i += LEITURA_EM_LOTE) {
    const pedaco = snap.docs.slice(i, i + LEITURA_EM_LOTE);
    const detalhes = await db.getAll(...pedaco.map((d) => d.ref.collection("series").doc("detalhe")));
    pedaco.forEach((doc, k) => {
      const a = doc.data();
      const atual = a.trajetoTrecho as TrechoGravado | undefined;
      if (atual?.origem === "manual" || atual?.origem === "inteira") {
        resultado.preservadas += 1;
        return;
      }
      const serie = detalhes[k].exists ? (detalhes[k].data() as Serie) : null;
      if (!serie?.lat) resultado.semGps += 1;
      const novo = serie?.lat ? detectar(serie, rota, a, configs) : SEM_TRECHO;
      if (novo.trecho) {
        resultado.comTrecho += 1;
        resultado.voltas += novo.voltas.length;
      } else if (serie?.lat) resultado.semCorrespondencia += 1;
      const voltasAtuais = (a.trajetoVoltas as TrechoGravado[] | undefined) ?? [];
      if (JSON.stringify(novo.trecho) !== JSON.stringify(atual ?? null) || JSON.stringify(novo.voltas) !== JSON.stringify(voltasAtuais)) {
        alteracoes.push({ ref: doc.ref, achado: novo });
      }
    });
  }
  for (let i = 0; i < alteracoes.length; i += ESCRITA_EM_LOTE) {
    const lote = db.batch();
    for (const { ref, achado } of alteracoes.slice(i, i + ESCRITA_EM_LOTE)) {
      lote.update(ref, camposDoTrecho(achado));
    }
    await lote.commit();
  }
  return resultado;
}

/**
 * Ajuste manual do trecho de uma atividade do trajeto, para quando a detecção automática erra:
 * `modo: "faixa"` (com `iniM` e `fimM` em metros), `"inteira"` (usa a atividade toda) ou `"auto"` (volta à detecção pela rota).
 */
export async function ajustarTrechoDaAtividade(
  uid: string,
  dados: Record<string, unknown>,
  carregarConfigs: () => Promise<ConfigAtleta[]>,
): Promise<{ trecho: TrechoGravado | null }> {
  const atividadeId = idValido(dados.atividadeId, "Atividade");
  const ref = db.doc(`atividades/${atividadeId}`);
  const atividade = await ref.get();
  if (!atividade.exists || atividade.get("userId") !== uid) throw new HttpsError("not-found", "Atividade não encontrada.");
  const trajetoId = atividade.get("trajetoId");
  if (typeof trajetoId !== "string") throw new HttpsError("failed-precondition", "A atividade não está em nenhum trajeto.");

  if (dados.modo === "inteira") {
    const trecho = { origem: "inteira" };
    await ref.update({ trajetoTrecho: trecho, trajetoVoltas: FieldValue.delete() });
    return { trecho };
  }
  if (dados.modo === "auto") {
    const campos = await trechoParaAtividadeNova(atividade, trajetoId, carregarConfigs);
    await ref.update(campos);
    return { trecho: campos.trajetoTrecho instanceof FieldValue ? null : (campos.trajetoTrecho as TrechoGravado) };
  }
  if (dados.modo !== "faixa") throw new HttpsError("invalid-argument", "Modo inválido.");

  const iniM = numeroOuNulo(dados.iniM, "Início do trecho");
  const fimM = numeroOuNulo(dados.fimM, "Fim do trecho");
  if (iniM === null || fimM === null || !(fimM > iniM)) throw new HttpsError("invalid-argument", "Informe o início e o fim do trecho.");
  const serie = await serieDaAtividade(ref);
  if (!serie?.dist) throw new HttpsError("failed-precondition", "Esta atividade não tem distância detalhada para marcar o trecho.");
  const faixa = trechoPorDistancia(serie, iniM, fimM);
  if (!faixa) throw new HttpsError("invalid-argument", "Esse trecho não existe na atividade. Confira o início e o fim.");
  const configs = await carregarConfigs();
  const trecho = resumoDoTrechoDoTrajeto(serie, faixa, String(atividade.get("esporte")), "manual", configDasZonas(configs, atividade.data() ?? {}));
  if (!trecho) throw new HttpsError("invalid-argument", "Esse trecho é curto demais.");
  await ref.update({ trajetoTrecho: trecho, trajetoVoltas: FieldValue.delete() }); // trecho escolhido à mão: vale uma passagem só
  return { trecho };
}
