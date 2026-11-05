import { describe, expect, it, vi } from "vitest";
import { ClienteStrava, extrairAtividades, lerUso, seriesParaArquivo, StravaErroApi } from "./strava.cliente";
import { exigirEscopoDeLeitura, motivoDaFalha, traduzirErro, validarCodigo } from "./strava.service";

function resposta(corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: cabecalhos });
}

const tokens = { access_token: "acesso-1", refresh_token: "renova-1", expires_at: 1_800_000_000, athlete: { id: 4242 } };

describe("ClienteStrava: OAuth", () => {
  it("troca o código por tokens, enviando o segredo no corpo", async () => {
    const f = vi.fn().mockResolvedValue(resposta(tokens));
    const t = await new ClienteStrava(f).trocarCodigo("85150", "segredo-do-app", "codigo123456");
    expect(t).toEqual({ accessToken: "acesso-1", refreshToken: "renova-1", expiraEmMs: 1_800_000_000_000, atletaId: "4242" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://www.strava.com/oauth/token");
    expect(init.method).toBe("POST");
    const corpo = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(corpo)).toEqual({
      client_id: "85150",
      client_secret: "segredo-do-app",
      code: "codigo123456",
      grant_type: "authorization_code",
    });
  });

  it("renova com o refresh token e devolve o novo par", async () => {
    const f = vi.fn().mockResolvedValue(resposta({ ...tokens, access_token: "acesso-2", refresh_token: "renova-2" }));
    const t = await new ClienteStrava(f).renovar("85150", "segredo", "renova-1");
    expect(t.accessToken).toBe("acesso-2");
    expect(t.refreshToken).toBe("renova-2");
    expect(Object.fromEntries(new URLSearchParams(String(f.mock.calls[0][1].body)))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "renova-1",
    });
  });

  it("recusa resposta de autorização sem os tokens", async () => {
    const f = vi.fn().mockResolvedValue(resposta({ access_token: "x" }));
    await expect(new ClienteStrava(f).trocarCodigo("1", "2", "codigo123456")).rejects.toMatchObject({ status: 502 });
  });

  it("desautoriza com o token de acesso", async () => {
    const f = vi.fn().mockResolvedValue(resposta({}));
    await new ClienteStrava(f).desautorizar("acesso-1");
    expect(f.mock.calls[0][0]).toBe("https://www.strava.com/oauth/deauthorize");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer acesso-1");
  });
});

describe("ClienteStrava: dados e limite", () => {
  it("lista com período e paginação", async () => {
    const f = vi.fn().mockResolvedValue(resposta([]));
    await new ClienteStrava(f).listarAtividades("tok", { depoisS: 100, antesS: 200, pagina: 3, porPagina: 10 });
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("https://www.strava.com/api/v3/athlete/activities?");
    for (const trecho of ["after=100", "before=200", "page=3", "per_page=10"]) expect(url).toContain(trecho);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("pede as séries por tipo e recusa id inválido", async () => {
    const f = vi.fn().mockResolvedValue(resposta({}));
    const c = new ClienteStrava(f);
    await c.buscarSeries("tok", "777");
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("/activities/777/streams?");
    expect(url).toContain("key_by_type=true");
    expect(url).toContain("heartrate");
    await expect(c.buscarSeries("tok", "../x")).rejects.toBeInstanceOf(StravaErroApi);
  });

  it("guarda o uso de leitura e avisa quando chega perto do limite do app", async () => {
    const c = new ClienteStrava(
      vi.fn().mockResolvedValue(resposta([], 200, { "x-readratelimit-usage": "196,300", "x-readratelimit-limit": "200,2000" })),
    );
    expect(c.pertoDoLimite()).toBe(false);
    await c.listarAtividades("tok", { depoisS: 1, antesS: 2, pagina: 1, porPagina: 10 });
    expect(c.uso).toEqual({ quinzeMin: 196, dia: 300, limiteQuinzeMin: 200, limiteDia: 2000 });
    expect(c.pertoDoLimite()).toBe(true);
  });

  it("guarda o corpo da resposta de erro para o log", async () => {
    const corpo = '{"message":"Authorization Error","errors":[{"field":"activity:read_permission","code":"missing"}]}';
    const f = vi.fn().mockResolvedValue(resposta(corpo, 401));
    await expect(new ClienteStrava(f).listarAtividades("t", { depoisS: 1, antesS: 2, pagina: 1, porPagina: 10 })).rejects.toMatchObject({
      status: 401,
      detalhe: corpo,
    });
  });

  it("propaga o status (429, 401) e a falta de resposta", async () => {
    await expect(new ClienteStrava(vi.fn().mockResolvedValue(resposta("x", 429))).buscarSeries("t", "1")).rejects.toMatchObject({ status: 429 });
    await expect(new ClienteStrava(vi.fn().mockRejectedValue(new Error("rede"))).buscarSeries("t", "1")).rejects.toMatchObject({ status: 0 });
  });
});

describe("lerUso", () => {
  it("lê os cabeçalhos e ignora o que não é o formato esperado", () => {
    expect(lerUso(new Headers({ "x-readratelimit-usage": "3,40", "x-readratelimit-limit": "200,2000" }))).toMatchObject({ quinzeMin: 3, dia: 40 });
    expect(lerUso(new Headers({ "x-readratelimit-usage": "abc" }))).toBeNull();
    expect(lerUso(new Headers())).toBeNull();
  });
});

describe("extrairAtividades", () => {
  it("lê os campos do resumo e monta o rótulo com nome e data", () => {
    const { itens, total } = extrairAtividades([
      { id: 11, name: "Pedal da manhã", sport_type: "Ride", start_date: "2026-11-04T09:30:00Z", start_date_local: "2026-11-04T06:30:00Z", has_heartrate: true, manual: false },
      { id: "22", type: "Run", has_heartrate: false, manual: true },
      { id: -1 },
      { name: "sem id" },
      null,
    ]);
    expect(total).toBe(5);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({
      id: "11",
      rotulo: "Pedal da manhã em 04/11/2026",
      sportType: "Ride",
      inicioMs: Date.parse("2026-11-04T09:30:00Z"),
      temFc: true,
      manual: false,
    });
    expect(itens[1]).toMatchObject({ id: "22", rotulo: "atividade 22", sportType: "Run", inicioMs: null, temFc: false, manual: true });
  });

  it("aceita só array", () => {
    expect(extrairAtividades({ activities: [] })).toEqual({ itens: [], total: 0 });
  });
});

describe("seriesParaArquivo", () => {
  const inicio = Date.parse("2026-11-04T09:30:00Z");
  const series = {
    time: { data: [0, 1, 2, 3] },
    heartrate: { data: [120, 130, 140, 150] },
    altitude: { data: [10, 11, 12, 13] },
    distance: { data: [0, 5, 10, 15] },
    velocity_smooth: { data: [0, 5, 5, 5] },
    latlng: { data: [[-30.1, -51.2], [-30.2, -51.3], [-30.3, -51.4], [-30.4, -51.5]] },
  };

  it("monta amostras com as unidades do app (segundos, m, m/s, graus)", () => {
    const lido = seriesParaArquivo(series, inicio, "Ride");
    expect(lido?.inicioMs).toBe(inicio);
    expect(lido?.esporteArquivo).toBe("Ride");
    expect(lido?.calorias).toBeNull();
    expect(lido?.amostras).toHaveLength(4);
    expect(lido?.amostras[3]).toEqual({ t: 3, fc: 150, alt: 13, dist: 15, vel: 5, lat: -30.4, lon: -51.5 });
  });

  it("aceita séries ausentes (só tempo e FC)", () => {
    const lido = seriesParaArquivo({ time: { data: [0, 10] }, heartrate: { data: [100, 110] } }, inicio, null);
    expect(lido?.amostras).toEqual([
      { t: 0, fc: 100 },
      { t: 10, fc: 110 },
    ]);
  });

  it("devolve null sem a série de tempo ou com entrada inválida", () => {
    expect(seriesParaArquivo({ heartrate: { data: [1, 2] } }, inicio, null)).toBeNull();
    expect(seriesParaArquivo(null, inicio, null)).toBeNull();
    expect(seriesParaArquivo(series, Number.NaN, null)).toBeNull();
  });
});

describe("validações e mensagens", () => {
  it("valida o código de autorização", () => {
    expect(validarCodigo(" abcdef1234567890 ")).toBe("abcdef1234567890");
    for (const ruim of ["", "curto", "tem espaço no meio ok", 12345678901234, null, "../../etc/passwd1"]) {
      expect(() => validarCodigo(ruim)).toThrow();
    }
  });

  it("exige o escopo de leitura de atividades", () => {
    expect(() => exigirEscopoDeLeitura("read,activity:read_all")).not.toThrow();
    expect(() => exigirEscopoDeLeitura("activity:read")).not.toThrow();
    expect(() => exigirEscopoDeLeitura("read")).toThrow(/permitir a leitura/);
    expect(() => exigirEscopoDeLeitura(undefined)).toThrow();
  });

  it("traduz 401 em reconexão e 429 em espera", () => {
    const recusado = traduzirErro(new StravaErroApi(401, "x", '{"message":"Authorization Error"}'));
    expect(recusado.details).toEqual({ codigo: "conexao-invalida" });
    expect(recusado.message).toContain("erro 401");
    const limite = traduzirErro(new StravaErroApi(429, "x"));
    expect(limite.code).toBe("resource-exhausted");
    expect(limite.message).toContain("15 minutos");
    expect(traduzirErro(new StravaErroApi(500, "x")).code).toBe("unavailable");
  });

  it("explica a falha de uma atividade", () => {
    expect(motivoDaFalha(new StravaErroApi(404, "x"))).toContain("sensor");
    expect(motivoDaFalha(new StravaErroApi(0, "x"))).toContain("não respondeu");
    expect(motivoDaFalha(new Error("x"))).toBe("erro inesperado ao ler os dados");
  });
});
