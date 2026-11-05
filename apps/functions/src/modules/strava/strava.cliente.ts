import { montarAmostras, numero, type Ponto } from "../atividades/parsers/amostra";
import type { ArquivoLido } from "../atividades/parsers";

/** API v3 do Strava: https://developers.strava.com/docs/reference/ */
export const URL_API = "https://www.strava.com/api/v3";
export const URL_OAUTH = "https://www.strava.com/oauth";
const TIMEOUT_MS = 30_000;
/** Séries pedidas por atividade (`key_by_type`: o Strava responde um objeto por tipo, com `data`). */
const SERIES = "time,latlng,heartrate,altitude,distance,velocity_smooth";
/** Margem de segurança: o limite de leitura é do app (somado entre todos os atletas), então para antes de chegar nele. */
const MARGEM_DO_LIMITE = 5;

export class StravaErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    /** Corpo da resposta de erro do Strava (ex.: `{"message":"Authorization Error","errors":[{"field":"activity:read_permission","code":"missing"}]}`). Só vai para o log. */
    readonly detalhe: string = "",
  ) {
    super(mensagem);
    this.name = "StravaErroApi";
  }
}

export type Requisitor = typeof fetch;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** ms desde 1970 */
  expiraEmMs: number;
  atletaId: string | null;
}

export interface UsoDeLeitura {
  quinzeMin: number;
  dia: number;
  limiteQuinzeMin: number;
  limiteDia: number;
}

/** Cabeçalhos `X-ReadRateLimit-Usage` e `X-ReadRateLimit-Limit` ("15min,dia"). */
export function lerUso(cabecalhos: Headers): UsoDeLeitura | null {
  const par = (nome: string): [number, number] | null => {
    const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(cabecalhos.get(nome) ?? "");
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const uso = par("x-readratelimit-usage");
  const limite = par("x-readratelimit-limit");
  if (!uso || !limite) return null;
  return { quinzeMin: uso[0], dia: uso[1], limiteQuinzeMin: limite[0], limiteDia: limite[1] };
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function lerTokens(corpo: unknown): Tokens {
  const o = typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>) : {};
  const accessToken = texto(o.access_token);
  const refreshToken = texto(o.refresh_token);
  const expiraEm = typeof o.expires_at === "number" ? o.expires_at : Number.NaN;
  if (!accessToken || !refreshToken || !Number.isFinite(expiraEm)) {
    throw new StravaErroApi(502, "O Strava devolveu uma resposta de autorização inesperada.");
  }
  const atleta = typeof o.athlete === "object" && o.athlete !== null ? (o.athlete as Record<string, unknown>).id : null;
  return {
    accessToken,
    refreshToken,
    expiraEmMs: expiraEm * 1000,
    atletaId: typeof atleta === "number" ? String(atleta) : null,
  };
}

export class ClienteStrava {
  /** Último uso de leitura informado pelo Strava (limite do app inteiro). */
  uso: UsoDeLeitura | null = null;

  constructor(private readonly f: Requisitor = fetch) {}

  /** Já perto do limite de 15 minutos? Quem sincroniza deve parar antes de levar um 429. */
  pertoDoLimite(): boolean {
    return this.uso !== null && this.uso.quinzeMin >= this.uso.limiteQuinzeMin - MARGEM_DO_LIMITE;
  }

  private async chamar(url: string, init: RequestInit): Promise<Response> {
    let resposta: Response;
    try {
      resposta = await this.f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StravaErroApi(0, "Sem resposta do Strava.");
    }
    this.uso = lerUso(resposta.headers) ?? this.uso;
    if (!resposta.ok) {
      const detalhe = await resposta.text().then((t) => t.slice(0, 400), () => "");
      throw new StravaErroApi(resposta.status, `Strava respondeu ${resposta.status}.`, detalhe);
    }
    return resposta;
  }

  private async pedirTokens(corpo: Record<string, string>): Promise<Tokens> {
    const resposta = await this.chamar(`${URL_OAUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(corpo),
    });
    return lerTokens(await resposta.json());
  }

  trocarCodigo(clientId: string, clientSecret: string, codigo: string): Promise<Tokens> {
    return this.pedirTokens({ client_id: clientId, client_secret: clientSecret, code: codigo, grant_type: "authorization_code" });
  }

  /** O Strava pode devolver outro refresh token: quem chama deve gravar o novo. */
  renovar(clientId: string, clientSecret: string, refreshToken: string): Promise<Tokens> {
    return this.pedirTokens({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  async desautorizar(accessToken: string): Promise<void> {
    await this.chamar(`${URL_OAUTH}/deauthorize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  }

  /** `pagina` começa em 1. `depoisS` e `antesS` são epoch em segundos. */
  async listarAtividades(token: string, p: { depoisS: number; antesS: number; pagina: number; porPagina: number }): Promise<unknown> {
    const consulta = new URLSearchParams({
      after: String(p.depoisS),
      before: String(p.antesS),
      page: String(p.pagina),
      per_page: String(p.porPagina),
    });
    const resposta = await this.chamar(`${URL_API}/athlete/activities?${consulta}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    return resposta.json();
  }

  async buscarSeries(token: string, atividadeId: string): Promise<unknown> {
    if (!/^[0-9]{1,20}$/.test(atividadeId)) throw new StravaErroApi(0, "Identificador de atividade inválido.");
    const consulta = new URLSearchParams({ keys: SERIES, key_by_type: "true" });
    const resposta = await this.chamar(`${URL_API}/activities/${atividadeId}/streams?${consulta}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    return resposta.json();
  }
}

export interface ResumoAtividade {
  /** Somente dígitos. */
  id: string;
  /** Nome e data da atividade, para explicar uma falha ao usuário. */
  rotulo: string;
  sportType: string | null;
  inicioMs: number | null;
  temFc: boolean;
  manual: boolean;
}

/** Lê a lista do Strava (um array de atividades resumidas) e ignora o que não tem identificador válido. */
export function extrairAtividades(resposta: unknown): { itens: ResumoAtividade[]; total: number } {
  const lista = Array.isArray(resposta) ? resposta : [];
  const itens: ResumoAtividade[] = [];
  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const idBruto = typeof o.id === "number" || typeof o.id === "string" ? String(o.id) : "";
    if (!/^[0-9]{1,20}$/.test(idBruto) || Number(idBruto) <= 0) continue;
    const inicio = typeof o.start_date === "string" ? Date.parse(o.start_date) : Number.NaN;
    const local = typeof o.start_date_local === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(o.start_date_local) : null;
    const nome = texto(o.name)?.trim().slice(0, 60) ?? "";
    const data = local ? `${local[3]}/${local[2]}/${local[1]}` : "";
    itens.push({
      id: idBruto,
      rotulo: [nome, data].filter(Boolean).join(" em ") || `atividade ${idBruto}`,
      sportType: texto(o.sport_type) ?? texto(o.type),
      inicioMs: Number.isFinite(inicio) ? inicio : null,
      temFc: o.has_heartrate === true,
      manual: o.manual === true,
    });
  }
  return { itens, total: lista.length };
}

function serie(streams: Record<string, unknown>, tipo: string): unknown[] {
  const s = streams[tipo];
  const dados = typeof s === "object" && s !== null ? (s as Record<string, unknown>).data : null;
  return Array.isArray(dados) ? dados : [];
}

/**
 * Converte as séries do Strava (uma lista por tipo, todas do mesmo tamanho) em amostras, o mesmo formato que os
 * parsers de arquivo produzem. `null` quando a atividade não tem a série de tempo.
 */
export function seriesParaArquivo(streams: unknown, inicioMs: number, esporteArquivo: string | null): ArquivoLido | null {
  if (typeof streams !== "object" || streams === null || !Number.isFinite(inicioMs)) return null;
  const s = streams as Record<string, unknown>;
  const tempo = serie(s, "time");
  if (tempo.length === 0) return null;
  const fc = serie(s, "heartrate");
  const alt = serie(s, "altitude");
  const dist = serie(s, "distance");
  const vel = serie(s, "velocity_smooth");
  const pos = serie(s, "latlng");

  const pontos: Ponto[] = [];
  for (let i = 0; i < tempo.length; i += 1) {
    const segundos = numero(tempo[i]);
    if (segundos === undefined) continue;
    const par = Array.isArray(pos[i]) ? (pos[i] as unknown[]) : [];
    pontos.push({
      ms: inicioMs + segundos * 1000,
      fc: numero(fc[i]),
      alt: numero(alt[i]),
      dist: numero(dist[i]),
      vel: numero(vel[i]),
      lat: numero(par[0]),
      lon: numero(par[1]),
    });
  }
  const montado = montarAmostras(pontos);
  return montado ? { inicioMs: montado.inicioMs, amostras: montado.amostras, esporteArquivo, calorias: null } : null;
}
