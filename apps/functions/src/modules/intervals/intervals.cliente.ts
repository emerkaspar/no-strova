/**
 * Cliente da API do intervals.icu (https://intervals.icu/api-docs.html). Autenticação básica com o usuário "API_KEY" e a chave
 * pessoal do atleta como senha; o atleta "0" é o dono da chave. O intervals.icu repassa os treinos planejados ao Garmin Connect.
 */

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
export type Requisitor = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

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

export async function atualizarEvento(chave: string, eventoId: string, evento: EventoIntervals, requisitor: Requisitor = requisitorPadrao): Promise<void> {
  await chamar(chave, "PUT", `/athlete/0/events/${encodeURIComponent(eventoId)}`, evento, requisitor);
}
