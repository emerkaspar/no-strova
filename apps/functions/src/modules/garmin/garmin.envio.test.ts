import { describe, expect, it, vi } from "vitest";
import { type ClienteGarmin, enviarTreinos, motivoDaFalha, type RegistroEnvio } from "./garmin.envio";
import { validarEntrada } from "./garmin.envio.service";
import { nomeNoGarmin, type TreinoPlano, treinoParaGarmin } from "./garmin.treino";

const treino = (extra: Partial<TreinoPlano> = {}): TreinoPlano => ({
  id: "t1",
  data: "2026-11-06",
  nome: "Pedrada",
  esporte: "ciclismo",
  passos: [
    { papel: "aquecimento", duracaoS: 600, zona: "Z2", descricao: "Aquecimento progressivo", fc: [120, 140] },
    { papel: "principal", duracaoS: 300, zona: "Z4", descricao: null, fc: [150, 160] },
    { papel: "recuperacao", duracaoS: 120, zona: "Z1", descricao: null, fc: null },
    { papel: "desaquecimento", duracaoS: 300, zona: "Z1", descricao: null, fc: null },
  ],
  ...extra,
});

function clienteFalso(sobrescrever: Partial<ClienteGarmin> = {}) {
  let proximo = 100;
  const cliente = {
    createWorkout: vi.fn(async () => ({ workoutId: ++proximo })),
    scheduleWorkout: vi.fn(async () => ({})),
    deleteWorkout: vi.fn(async () => ({})),
    ...sobrescrever,
  };
  return cliente;
}

describe("treinoParaGarmin", () => {
  it("o nome leva o dia na frente", () => {
    expect(nomeNoGarmin(treino())).toBe("06/11 Pedrada");
  });

  it("monta os passos por tempo, na ordem, com o tipo certo", () => {
    const g = treinoParaGarmin(treino());
    expect(g.workoutName).toBe("06/11 Pedrada");
    expect(g.sportType.sportTypeKey).toBe("cycling");
    expect(g.estimatedDurationInSecs).toBe(1320);
    const passos = g.workoutSegments![0].workoutSteps! as any[];
    expect(passos.map((p: any) => p.stepType.stepTypeKey)).toEqual(["warmup", "interval", "recovery", "cooldown"]);
    expect(passos.map((p: any) => p.stepOrder)).toEqual([1, 2, 3, 4]);
    expect(passos.map((p: any) => p.endConditionValue)).toEqual([600, 300, 120, 300]);
  });

  it("a faixa de FC vira alvo em bpm e o passo sem faixa fica sem alvo", () => {
    const passos = treinoParaGarmin(treino()).workoutSegments![0].workoutSteps! as any[];
    expect(passos[1].targetType.workoutTargetTypeKey).toBe("heart.rate.zone");
    expect([passos[1].targetValueOne, passos[1].targetValueTwo]).toEqual([150, 160]);
    expect(passos[2].targetType.workoutTargetTypeKey).toBe("no.target");
  });

  it("corrida vira treino de corrida", () => {
    expect(treinoParaGarmin(treino({ esporte: "corrida" })).sportType.sportTypeKey).toBe("running");
  });

  it("recusa treino sem passos", () => {
    expect(() => treinoParaGarmin(treino({ passos: [] }))).toThrow();
  });
});

describe("enviarTreinos", () => {
  it("cria, agenda no dia e registra", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    const gravados: Array<[string, RegistroEnvio]> = [];
    const r = await enviarTreinos(cliente, [treino()], registros, async (id, reg) => void gravados.push([id, reg]));
    expect(r).toMatchObject({ enviados: 1, jaEnviados: 0, falhas: 0 });
    expect(cliente.scheduleWorkout).toHaveBeenCalledWith({ workoutId: "101" }, "2026-11-06");
    expect(gravados[0][0]).toBe("t1");
    expect(gravados[0][1].workoutId).toBe("101");
  });

  it("não reenvia o treino igual ao já enviado", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    await enviarTreinos(cliente, [treino()], registros, async (id, reg) => void registros.set(id, reg));
    const r = await enviarTreinos(cliente, [treino()], registros, async () => {});
    expect(r).toMatchObject({ enviados: 0, jaEnviados: 1 });
    expect(cliente.createWorkout).toHaveBeenCalledTimes(1);
  });

  it("treino que mudou apaga a versão antiga e cria a nova", async () => {
    const cliente = clienteFalso();
    const registros = new Map<string, RegistroEnvio>();
    await enviarTreinos(cliente, [treino()], registros, async (id, reg) => void registros.set(id, reg));
    const r = await enviarTreinos(cliente, [treino({ data: "2026-11-07" })], registros, async (id, reg) => void registros.set(id, reg));
    expect(r).toMatchObject({ enviados: 1, substituidos: 1 });
    expect(cliente.deleteWorkout).toHaveBeenCalledWith({ workoutId: "101" });
    expect(cliente.scheduleWorkout).toHaveBeenLastCalledWith({ workoutId: "102" }, "2026-11-07");
  });

  it("seguir criando a nova versão mesmo se apagar a antiga falhar", async () => {
    const cliente = clienteFalso({ deleteWorkout: vi.fn(async () => Promise.reject(new Error("404"))) });
    const registros = new Map<string, RegistroEnvio>([["t1", { workoutId: "9", assinatura: "outra" }]]);
    const r = await enviarTreinos(cliente, [treino()], registros, async () => {});
    expect(r).toMatchObject({ enviados: 1, falhas: 0, substituidos: 0 });
  });

  it("a falha de um treino não impede os outros e não registra o que falhou", async () => {
    const cliente = clienteFalso({
      scheduleWorkout: vi.fn(async (_t, data: string) => {
        if (data === "2026-11-06") throw new Error("Request failed with status code 500");
        return {};
      }),
    });
    const gravados: string[] = [];
    const r = await enviarTreinos(cliente, [treino(), treino({ id: "t2", data: "2026-11-07" })], new Map(), async (id) => void gravados.push(id));
    expect(r).toMatchObject({ enviados: 1, falhas: 1 });
    expect(r.problemas[0]).toMatchObject({ data: "2026-11-06", nome: "06/11 Pedrada" });
    expect(gravados).toEqual(["t2"]);
  });

  it("resposta sem código do treino conta como falha", async () => {
    const cliente = clienteFalso({ createWorkout: vi.fn(async () => ({})) });
    const r = await enviarTreinos(cliente, [treino()], new Map(), async () => {});
    expect(r.falhas).toBe(1);
    expect(cliente.scheduleWorkout).not.toHaveBeenCalled();
  });

  it("informa o andamento a cada treino", async () => {
    const andamento: Array<[number, number]> = [];
    await enviarTreinos(clienteFalso(), [treino(), treino({ id: "t2" })], new Map(), async () => {}, async (f, t) => void andamento.push([f, t]));
    expect(andamento).toEqual([[1, 2], [2, 2]]);
  });
});

describe("motivoDaFalha", () => {
  it("traduz o limite de tentativas e não vaza texto longo", () => {
    expect(motivoDaFalha(new Error("Request failed with status code 429"))).toMatch(/limitou/);
    expect(motivoDaFalha(new Error("x".repeat(500))).length).toBeLessThanOrEqual(160);
  });
});

describe("validarEntrada", () => {
  const ok = { email: "a@b.com", senha: "segredo", de: "2026-11-06", ate: "2026-11-12" };
  it("aceita a entrada válida", () => {
    expect(validarEntrada(ok)).toEqual(ok);
  });
  it("recusa e-mail, senha e datas inválidos", () => {
    expect(() => validarEntrada({ ...ok, email: "sem-arroba" })).toThrow();
    expect(() => validarEntrada({ ...ok, senha: "" })).toThrow();
    expect(() => validarEntrada({ ...ok, de: "06/11/2026" })).toThrow();
    expect(() => validarEntrada({ ...ok, de: "2026-11-13" })).toThrow();
  });
  it("recusa período maior que 62 dias", () => {
    expect(() => validarEntrada({ ...ok, ate: "2027-02-01" })).toThrow();
    expect(() => validarEntrada({ ...ok, ate: "2027-01-06" })).not.toThrow();
  });
});
