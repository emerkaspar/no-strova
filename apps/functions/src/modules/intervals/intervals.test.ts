import { describe, expect, it, vi } from "vitest";
import { atualizarEvento, criarEvento, IntervalsErroApi, obterAtleta, type Requisitor } from "./intervals.cliente";
import { type ClienteIntervals, enviarTreinos, eventoDoTreino, motivoDaFalha, nomeDoEvento, type RegistroEnvio, type TreinoPlano } from "./intervals.envio";
import { validarChave, validarPeriodo } from "./intervals.service";

const treino = (extra: Partial<TreinoPlano> = {}): TreinoPlano => ({
  id: "t1",
  data: "2026-11-06",
  nome: "Pedrada",
  esporte: "ciclismo",
  passos: [
    { papel: "aquecimento", duracaoS: 600, zona: "Z2", descricao: "Aquecimento progressivo", fc: [120, 140] },
    { papel: "principal", duracaoS: 300, zona: "Z4", descricao: null, fc: [150, 160] },
  ],
  ...extra,
});

function clienteFalso(sobrescrever: Partial<ClienteIntervals> = {}) {
  let proximo = 500;
  return {
    criar: vi.fn(async () => String(++proximo)),
    atualizar: vi.fn(async () => {}),
    ...sobrescrever,
  };
}

describe("eventoDoTreino", () => {
  it("monta o evento de treino do calendário", () => {
    const e = eventoDoTreino(treino());
    expect(e).toMatchObject({ category: "WORKOUT", start_date_local: "2026-11-06T00:00:00", type: "Ride", name: "06/11 Pedrada", external_id: "no-strova-t1" });
    expect(e.description).toBe("- 10m 80-89% LTHR Aquecimento progressivo\n- 5m 94.5-100% LTHR Esforço");
  });
  it("corrida vira Run e treino sem passos é recusado", () => {
    expect(eventoDoTreino(treino({ esporte: "corrida" })).type).toBe("Run");
    expect(() => eventoDoTreino(treino({ passos: [] }))).toThrow();
  });
  it("o nome leva o dia na frente", () => {
    expect(nomeDoEvento(treino())).toBe("06/11 Pedrada");
  });
});

describe("enviarTreinos", () => {
  const gravar = (registros: Map<string, RegistroEnvio>) => async (id: string, r: RegistroEnvio) => void registros.set(id, r);

  it("cria o evento e registra", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    const r = await enviarTreinos(cliente, [treino()], registros, gravar(registros));
    expect(r).toMatchObject({ enviados: 1, atualizados: 0, jaEnviados: 0, falhas: 0 });
    expect(registros.get("t1")?.eventoId).toBe("501");
  });

  it("não reenvia o treino igual", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    await enviarTreinos(cliente, [treino()], registros, gravar(registros));
    const r = await enviarTreinos(cliente, [treino()], registros, gravar(registros));
    expect(r).toMatchObject({ enviados: 0, jaEnviados: 1 });
    expect(cliente.criar).toHaveBeenCalledTimes(1);
  });

  it("treino que mudou atualiza o mesmo evento", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    await enviarTreinos(cliente, [treino()], registros, gravar(registros));
    const r = await enviarTreinos(cliente, [treino({ data: "2026-11-07" })], registros, gravar(registros));
    expect(r).toMatchObject({ enviados: 0, atualizados: 1 });
    expect(cliente.atualizar).toHaveBeenCalledWith("501", expect.objectContaining({ start_date_local: "2026-11-07T00:00:00" }));
    expect(cliente.criar).toHaveBeenCalledTimes(1);
  });

  it("evento apagado no intervals.icu (404) é criado de novo", async () => {
    const cliente = clienteFalso({ atualizar: vi.fn(async () => Promise.reject(new IntervalsErroApi(404, "não achou"))) });
    const registros = new Map<string, RegistroEnvio>([["t1", { eventoId: "9", assinatura: "outra" }]]);
    const r = await enviarTreinos(cliente, [treino()], registros, gravar(registros));
    expect(r).toMatchObject({ enviados: 1, atualizados: 0, falhas: 0 });
    expect(registros.get("t1")?.eventoId).toBe("501");
  });

  it("a falha de um treino não impede os outros e não registra o que falhou", async () => {
    const cliente = clienteFalso({
      criar: vi.fn(async (e) => {
        if (e.start_date_local.startsWith("2026-11-06")) throw new IntervalsErroApi(500, "O intervals.icu respondeu com o erro 500.");
        return "700";
      }),
    });
    const registros = new Map<string, RegistroEnvio>();
    const r = await enviarTreinos(cliente, [treino(), treino({ id: "t2", data: "2026-11-07" })], registros, gravar(registros));
    expect(r).toMatchObject({ enviados: 1, falhas: 1 });
    expect(r.problemas[0]).toMatchObject({ data: "2026-11-06", nome: "06/11 Pedrada" });
    expect([...registros.keys()]).toEqual(["t2"]);
  });
});

describe("motivoDaFalha", () => {
  it("traduz chave recusada e limite de requisições", () => {
    expect(motivoDaFalha(new IntervalsErroApi(401, "x"))).toMatch(/recusou a chave/);
    expect(motivoDaFalha(new IntervalsErroApi(429, "x"))).toMatch(/limitou/);
  });
});

describe("cliente HTTP", () => {
  const resposta = (status: number, corpo: unknown = {}) => ({ status, json: async () => corpo });

  it("autentica com API_KEY e a chave, e lê o atleta", async () => {
    const requisitor = vi.fn<Requisitor>(async () => resposta(200, { id: "i12345", name: "Emer" }));
    expect(await obterAtleta("minha-chave", requisitor)).toEqual({ id: "i12345", name: "Emer" });
    const [url, init] = requisitor.mock.calls[0];
    expect(url).toBe("https://intervals.icu/api/v1/athlete/0");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("API_KEY:minha-chave").toString("base64")}`);
  });

  it("cria o evento por POST e devolve o código", async () => {
    const requisitor = vi.fn<Requisitor>(async () => resposta(200, { id: 321 }));
    expect(await criarEvento("k", eventoDoTreino(treino()), requisitor)).toBe("321");
    expect(requisitor.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(requisitor.mock.calls[0][1].body!).external_id).toBe("no-strova-t1");
  });

  it("atualiza o evento por PUT", async () => {
    const requisitor = vi.fn<Requisitor>(async () => resposta(200));
    await atualizarEvento("k", "321", eventoDoTreino(treino()), requisitor);
    expect(requisitor.mock.calls[0][0]).toBe("https://intervals.icu/api/v1/athlete/0/events/321");
    expect(requisitor.mock.calls[0][1].method).toBe("PUT");
  });

  it("status de erro vira IntervalsErroApi com o código", async () => {
    const requisitor = vi.fn<Requisitor>(async () => resposta(401));
    await expect(obterAtleta("k", requisitor)).rejects.toMatchObject({ status: 401 });
  });
});

describe("validações", () => {
  it("chave: recusa curta, com espaço e vazia", () => {
    expect(() => validarChave("")).toThrow();
    expect(() => validarChave("curta")).toThrow();
    expect(() => validarChave("tem espaco no meio")).toThrow();
    expect(validarChave("  abcdefgh1234  ")).toBe("abcdefgh1234");
  });
  it("período: formato, ordem e máximo de 62 dias", () => {
    expect(validarPeriodo({ de: "2026-11-06", ate: "2026-11-12" })).toEqual({ de: "2026-11-06", ate: "2026-11-12" });
    expect(() => validarPeriodo({ de: "06/11/2026", ate: "2026-11-12" })).toThrow();
    expect(() => validarPeriodo({ de: "2026-11-13", ate: "2026-11-12" })).toThrow();
    expect(() => validarPeriodo({ de: "2026-11-06", ate: "2027-02-01" })).toThrow();
  });
});
