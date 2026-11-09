/**
 * Cliente da API do intervals.icu (https://intervals.icu/api-docs.html). Autenticação básica com o usuário "API_KEY" e a chave
 * pessoal do atleta como senha; o atleta "0" é o dono da chave. O intervals.icu repassa os treinos planejados ao Garmin Connect.
 */

import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";

const BASE = "https://intervals.icu/api/v1";

export class IntervalsErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "IntervalsErroApi";
  }
}

export interface EventoIntervals {
  category: "WORKOUT";
  start_date_local: string;
  type: string;
  name: string;
  description: string;
  external_id: string;
}

export interface AtletaIntervals {
  id: string;
  name: string | null;
}

/** Quem faz a requisição HTTP (trocado nos testes). */
export type Requisitor = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; json: () => Promise<unknown>; arrayBuffer?: () => Promise<ArrayBuffer> }>;

const requisitorPadrao: Requisitor = (url, init) => fetch(url, init);

function cabecalhos(chave: string, corpo: boolean): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`API_KEY:${chave}`).toString("base64")}`,
    Accept: "application/json",
    ...(corpo ? { "Content-Type": "application/json" } : {}),
  };
}

async function chamar(chave: string, metodo: string, caminho: string, corpo: unknown, requisitor: Requisitor): Promise<unknown> {
  const resposta = await requisitor(`${BASE}${caminho}`, {
    method: metodo,
    headers: cabecalhos(chave, corpo !== undefined),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (resposta.status < 200 || resposta.status >= 300) {
    throw new IntervalsErroApi(resposta.status, `O intervals.icu respondeu com o erro ${resposta.status}.`);
  }
  return resposta.status === 204 ? null : resposta.json().catch(() => null);
}

/** Confere a chave e devolve o atleta dono dela. */
export async function obterAtleta(chave: string, requisitor: Requisitor = requisitorPadrao): Promise<AtletaIntervals> {
  const dados = (await chamar(chave, "GET", "/athlete/0", undefined, requisitor)) as { id?: unknown; name?: unknown } | null;
  if (!dados || (typeof dados.id !== "string" && typeof dados.id !== "number")) {
    throw new IntervalsErroApi(0, "O intervals.icu não devolveu os dados do atleta.");
  }
  return { id: String(dados.id), name: typeof dados.name === "string" ? dados.name : null };
}

export async function criarEvento(chave: string, evento: EventoIntervals, requisitor: Requisitor = requisitorPadrao): Promise<string> {
  const dados = (await chamar(chave, "POST", "/athlete/0/events", evento, requisitor)) as { id?: unknown } | null;
  if (typeof dados?.id === "number" || (typeof dados?.id === "string" && dados.id !== "")) return String(dados.id);
  throw new IntervalsErroApi(0, "O intervals.icu não devolveu o código do treino criado.");
}

/** Esportes cujo LTHR o app confere e atualiza: o tipo de atividade das configurações de esporte do intervals.icu. */
export type EsporteIntervals = "Ride" | "Run";

const numeroOuNulo = (valor: unknown): number | null => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);

/** LTHR configurado no intervals.icu para o esporte, ou null (sem configuração para o esporte ou sem LTHR). */
export async function obterLthr(chave: string, esporte: EsporteIntervals, requisitor: Requisitor = requisitorPadrao): Promise<number | null> {
  try {
    const dados = (await chamar(chave, "GET", `/athlete/0/sport-settings/${esporte}`, undefined, requisitor)) as { lthr?: unknown } | null;
    return numeroOuNulo(dados?.lthr);
  } catch (erro) {
    if (erro instanceof IntervalsErroApi && erro.status === 404) return null;
    throw erro;
  }
}

/**
 * Grava o LTHR do esporte no intervals.icu e devolve o valor que ele confirmou. `recalcHrZones=false`: não recalcula as zonas de
 * FC, para preservar as que o usuário ajustou lá (os treinos vão em % do LTHR e não dependem das zonas).
 */
export async function atualizarLthr(chave: string, esporte: EsporteIntervals, lthr: number, requisitor: Requisitor = requisitorPadrao): Promise<number | null> {
  const dados = (await chamar(chave, "PUT", `/athlete/0/sport-settings/${esporte}?recalcHrZones=false`, { lthr }, requisitor)) as { lthr?: unknown } | null;
  return numeroOuNulo(dados?.lthr);
}

/** Atividade da listagem do intervals.icu (as que chegam de outros serviços, como a IGPSPORT, também aparecem aqui). */
export interface AtividadeIntervals {
  /** Ex.: "i123456". */
  id: string;
  /** Nome e data, para explicar uma falha ao usuário. */
  rotulo: string;
  /** Início local ("2026-11-06T07:30:00"), usado para ordenar. */
  inicio: string;
  /** false: não há arquivo original para baixar (ex.: atividade vinda do Strava, que a API do intervals.icu não entrega). */
  temArquivo: boolean;
}

const ID_ATIVIDADE = /^[A-Za-z0-9_-]{1,30}$/;

function lerAtividade(item: unknown): AtividadeIntervals | null {
  if (typeof item !== "object" || item === null) return null;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" || typeof o.id === "number" ? String(o.id) : "";
  if (!ID_ATIVIDADE.test(id)) return null;
  const inicio = typeof o.start_date_local === "string" ? o.start_date_local : "";
  const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(inicio);
  const nome = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
  const rotulo = [nome || `atividade ${id}`, data ? `${data[3]}/${data[2]}/${data[1]}` : ""].filter(Boolean).join(" em ");
  // as do Strava vêm sem dados (a API do Strava não deixa o intervals.icu repassá-los) e trazem um aviso em `_note`
  const doStrava = o.source === "STRAVA" || typeof o._note === "string";
  return { id, rotulo, inicio, temArquivo: !doStrava };
}

/** Atividades do período (datas locais YYYY-MM-DD), da mais antiga para a mais recente. */
export async function listarAtividades(
  chave: string,
  periodo: { de: string; ate: string },
  requisitor: Requisitor = requisitorPadrao,
): Promise<AtividadeIntervals[]> {
  const consulta = new URLSearchParams({ oldest: periodo.de, newest: periodo.ate });
  const dados = await chamar(chave, "GET", `/athlete/0/activities?${consulta}`, undefined, requisitor);
  const lista = Array.isArray(dados) ? dados : [];
  return lista
    .map(lerAtividade)
    .filter((a): a is AtividadeIntervals => a !== null)
    .sort((a, b) => (a.inicio === b.inicio ? a.id.localeCompare(b.id) : a.inicio.localeCompare(b.inicio)));
}

/**
 * Arquivo original da atividade (`GET /activity/{id}/file`), já descompactado se vier em gzip.
 * @returns o conteúdo, ou null quando o intervals.icu não tem arquivo dela (404/422)
 */
export async function baixarArquivoOriginal(
  chave: string,
  atividadeId: string,
  limiteBytes: number,
  requisitor: Requisitor = requisitorPadrao,
): Promise<Buffer | null> {
  if (!ID_ATIVIDADE.test(atividadeId)) throw new IntervalsErroApi(0, "Identificador de atividade inválido.");
  const resposta = await requisitor(`${BASE}/activity/${encodeURIComponent(atividadeId)}/file`, {
    method: "GET",
    headers: { Authorization: cabecalhos(chave, false).Authorization, Accept: "*/*" },
  });
  if (resposta.status === 404 || resposta.status === 422) return null;
  if (resposta.status < 200 || resposta.status >= 300) {
    throw new IntervalsErroApi(resposta.status, `O intervals.icu respondeu com o erro ${resposta.status}.`);
  }
  if (!resposta.arrayBuffer) throw new IntervalsErroApi(0, "Resposta sem conteúdo binário.");
  let conteudo = Buffer.from(await resposta.arrayBuffer());
  if (conteudo.length === 0) return null;
  if (conteudo.length > limiteBytes) throw new IntervalsErroApi(413, "O arquivo da atividade é grande demais.");
  if (conteudo[0] === 0x1f && conteudo[1] === 0x8b) {
    try {
      conteudo = gunzipSync(conteudo, { maxOutputLength: limiteBytes });
    } catch {
      throw new IntervalsErroApi(502, "Não foi possível descompactar o arquivo da atividade.");
    }
  }
  return conteudo;
}

export async function atualizarEvento(chave: string, eventoId: string, evento: EventoIntervals, requisitor: Requisitor = requisitorPadrao): Promise<void> {
  await chamar(chave, "PUT", `/athlete/0/events/${encodeURIComponent(eventoId)}`, evento, requisitor);
}
