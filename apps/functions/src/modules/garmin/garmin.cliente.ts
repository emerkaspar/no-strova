import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

/** Garmin Connect Personal API: https://developer.garmin.com/gc-developer-program/personal/personal-api */
export const BASE_URL = "https://personal.connectapi.garmin.com";
const CAMINHO_TOKEN = "/personalapitoken-service/personal-api/personal-api-key/token";
const CAMINHO_LISTA = "/activitylist-service/activities/search/activities";
const CAMINHO_ARQUIVO = "/download-service/files/activity";
const TIMEOUT_MS = 30_000;
export const TAMANHO_MAXIMO_ZIP_BYTES = 15 * 1024 * 1024;

export class GarminErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "GarminErroApi";
  }
}

export type Requisitor = typeof fetch;

async function chamar(f: Requisitor, url: string, init: RequestInit): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GarminErroApi(0, "Sem resposta do Garmin.");
  }
  if (!resposta.ok) throw new GarminErroApi(resposta.status, `Garmin respondeu ${resposta.status}.`);
  return resposta;
}

/** Troca a chave pessoal por um token (JWT em texto puro, válido por até 24 h; não há refresh token). */
export async function obterToken(chave: string, f: Requisitor = fetch): Promise<string> {
  const resposta = await chamar(f, `${BASE_URL}${CAMINHO_TOKEN}`, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${chave}` },
  });
  const token = (await resposta.text()).trim();
  if (!token) throw new GarminErroApi(502, "O Garmin não devolveu um token.");
  return token;
}

export interface ItemAtividade {
  /** Somente dígitos. */
  id: string;
  /** Nome e data da atividade no Garmin, quando a listagem os traz (para explicar uma falha ao usuário). */
  rotulo?: string;
}

export interface ParametrosLista {
  inicio: number;
  limite: number;
  /** YYYY-MM-DD */
  de: string;
  /** YYYY-MM-DD */
  ate: string;
}

export async function listarAtividades(token: string, p: ParametrosLista, f: Requisitor = fetch): Promise<unknown> {
  const consulta = new URLSearchParams({
    start: String(p.inicio),
    limit: String(p.limite),
    startDate: p.de,
    endDate: p.ate,
  });
  const resposta = await chamar(f, `${BASE_URL}${CAMINHO_LISTA}?${consulta}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  return resposta.json();
}

function idDoItem(item: unknown): string | null {
  if (typeof item !== "object" || item === null) return null;
  const bruto = (item as Record<string, unknown>).activityId;
  const texto = typeof bruto === "number" || typeof bruto === "string" ? String(bruto) : "";
  return /^[0-9]{1,20}$/.test(texto) && Number(texto) > 0 ? texto : null;
}

function rotuloDoItem(item: unknown): { rotulo?: string } {
  const o = item as Record<string, unknown>;
  const nome = typeof o.activityName === "string" ? o.activityName.trim().slice(0, 60) : "";
  const inicio = typeof o.startTimeLocal === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(o.startTimeLocal) : null;
  const data = inicio ? `${inicio[3]}/${inicio[2]}/${inicio[1]}` : "";
  const rotulo = [nome, data].filter(Boolean).join(" em ");
  return rotulo ? { rotulo } : {};
}

/**
 * Extrai os identificadores da resposta da listagem. O formato exato não é documentado publicamente, então
 * aceita uma lista na raiz ou dentro de um objeto, e lê `activityId` de cada item.
 */
export function extrairItens(resposta: unknown): { itens: ItemAtividade[]; total: number } {
  let lista: unknown[] = [];
  if (Array.isArray(resposta)) {
    lista = resposta;
  } else if (typeof resposta === "object" && resposta !== null) {
    const achada = Object.values(resposta).find((v) => Array.isArray(v));
    if (Array.isArray(achada)) lista = achada;
  }
  const itens: ItemAtividade[] = [];
  for (const item of lista) {
    const id = idDoItem(item);
    if (id) itens.push({ id, ...rotuloDoItem(item) });
  }
  return { itens, total: lista.length };
}

/** O arquivo original da atividade vem em um ZIP. */
export async function baixarArquivoZip(token: string, atividadeId: string, f: Requisitor = fetch): Promise<Buffer> {
  if (!/^[0-9]{1,20}$/.test(atividadeId)) throw new GarminErroApi(0, "Identificador de atividade inválido.");
  const resposta = await chamar(f, `${BASE_URL}${CAMINHO_ARQUIVO}/${atividadeId}`, {
    headers: {
      Accept: "application/zip, application/x-zip-compressed, application/octet-stream",
      Authorization: `Bearer ${token}`,
    },
  });
  const conteudo = Buffer.from(await resposta.arrayBuffer());
  if (conteudo.length === 0) throw new GarminErroApi(502, "O arquivo da atividade veio vazio.");
  if (conteudo.length > TAMANHO_MAXIMO_ZIP_BYTES) throw new GarminErroApi(413, "O arquivo da atividade é grande demais.");
  return conteudo;
}

/** Um arquivo FIT começa com o cabeçalho de 12 ou 14 bytes e tem ".FIT" nos bytes 8 a 11. */
export function pareceFit(conteudo: Buffer): boolean {
  return conteudo.length > 14 && conteudo.toString("latin1", 8, 12) === ".FIT";
}

/** O download costuma vir em ZIP, mas aceita também o .fit puro. */
export function obterFit(conteudo: Buffer, limiteBytes: number): Buffer | null {
  if (pareceFit(conteudo)) return conteudo.length <= limiteBytes ? conteudo : null;
  return extrairFit(conteudo, limiteBytes);
}

/** Descreve o que veio do Garmin quando não há .fit (nomes e tamanhos das entradas do ZIP), para o log. */
export function descreverDownload(conteudo: Buffer): string {
  const inicio = conteudo.subarray(0, 4).toString("hex");
  const minimo = Math.max(0, conteudo.length - 22 - 0xffff);
  for (let i = conteudo.length - 22; i >= minimo; i -= 1) {
    if (conteudo.readUInt32LE(i) !== FIM_DIRETORIO) continue;
    const entradas: string[] = [];
    let pos = conteudo.readUInt32LE(i + 16);
    for (let n = 0; n < conteudo.readUInt16LE(i + 10) && pos + 46 <= conteudo.length && n < 20; n += 1) {
      if (conteudo.readUInt32LE(pos) !== ENTRADA_DIRETORIO) break;
      const nome = conteudo.toString("utf8", pos + 46, pos + 46 + conteudo.readUInt16LE(pos + 28));
      entradas.push(`${nome} (método ${conteudo.readUInt16LE(pos + 10)}, ${conteudo.readUInt32LE(pos + 24)} bytes)`);
      pos += 46 + conteudo.readUInt16LE(pos + 28) + conteudo.readUInt16LE(pos + 30) + conteudo.readUInt16LE(pos + 32);
    }
    return `ZIP de ${conteudo.length} bytes com: ${entradas.join(", ") || "nenhuma entrada"}`;
  }
  return `${conteudo.length} bytes, não é ZIP nem FIT (começa com ${inicio})`;
}

const FIM_DIRETORIO = 0x06054b50;
const ENTRADA_DIRETORIO = 0x02014b50;

/**
 * Lê o primeiro arquivo .fit de um ZIP (método armazenado ou deflate), sem dependências.
 * Respeita `limiteBytes` para não descompactar arquivos enormes.
 * @returns o conteúdo do .fit, ou null se o ZIP não tem um .fit utilizável
 */
export function extrairFit(zip: Buffer, limiteBytes: number): Buffer | null {
  const minimo = Math.max(0, zip.length - 22 - 0xffff);
  let fim = -1;
  for (let i = zip.length - 22; i >= minimo; i -= 1) {
    if (zip.readUInt32LE(i) === FIM_DIRETORIO) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;

  const total = zip.readUInt16LE(fim + 10);
  let pos = zip.readUInt32LE(fim + 16);
  for (let n = 0; n < total && pos + 46 <= zip.length; n += 1) {
    if (zip.readUInt32LE(pos) !== ENTRADA_DIRETORIO) return null;
    const metodo = zip.readUInt16LE(pos + 10);
    const tamanhoComprimido = zip.readUInt32LE(pos + 20);
    const tamanhoOriginal = zip.readUInt32LE(pos + 24);
    const tamNome = zip.readUInt16LE(pos + 28);
    const tamExtra = zip.readUInt16LE(pos + 30);
    const tamComentario = zip.readUInt16LE(pos + 32);
    const deslocamento = zip.readUInt32LE(pos + 42);
    const nome = zip.toString("utf8", pos + 46, pos + 46 + tamNome);
    pos += 46 + tamNome + tamExtra + tamComentario;

    if (!/\.fit$/i.test(nome) || tamanhoOriginal === 0 || tamanhoOriginal > limiteBytes) continue;
    if (deslocamento + 30 > zip.length || zip.readUInt32LE(deslocamento) !== 0x04034b50) return null;
    const inicio = deslocamento + 30 + zip.readUInt16LE(deslocamento + 26) + zip.readUInt16LE(deslocamento + 28);
    const dados = zip.subarray(inicio, inicio + tamanhoComprimido);
    if (dados.length !== tamanhoComprimido) return null;
    if (metodo === 0) return Buffer.from(dados);
    if (metodo === 8) {
      try {
        return inflateRawSync(dados, { maxOutputLength: limiteBytes });
      } catch {
        return null;
      }
    }
  }
  return null;
}
