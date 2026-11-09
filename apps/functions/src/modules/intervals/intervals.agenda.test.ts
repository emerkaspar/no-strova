import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { classificarFalha, type ConexaoAgendada, type DependenciasAgenda, ordenarPorTentativa, rodarAgenda } from "./intervals.agenda";

const conexao = (uid: string, ultimaTentativaMs: number | null = null): ConexaoAgendada => ({ uid, ultimaTentativaMs });

function dependencias(fila: ConexaoAgendada[], sobrescrever: Partial<DependenciasAgenda> = {}) {
  let relogio = 0;
  const deps = {
    listar: vi.fn(async () => fila),
    sincronizar: vi.fn(async () => ({ importadas: 1 })),
    marcarChaveInvalida: vi.fn(async () => {}),
    registrarFalha: vi.fn(async () => {}),
    avisarChaveInvalida: vi.fn(async () => {}),
    agora: () => relogio,
    ...sobrescrever,
  };
  return { deps: deps as DependenciasAgenda & typeof deps, avancar: (ms: number) => (relogio += ms) };
}

describe("classificarFalha", () => {
  it("separa chave recusada, limite de requisições e o resto", () => {
    expect(classificarFalha(new HttpsError("failed-precondition", "chave"))).toBe("chaveInvalida");
    expect(classificarFalha(new HttpsError("resource-exhausted", "limite"))).toBe("limite");
    expect(classificarFalha(new HttpsError("unavailable", "fora do ar"))).toBe("outra");
    expect(classificarFalha(new Error("rede"))).toBe("outra");
  });
});

describe("ordenarPorTentativa", () => {
  it("quem nunca tentou vem primeiro, depois a tentativa mais antiga", () => {
    const ordem = ordenarPorTentativa([conexao("c", 300), conexao("a", null), conexao("b", 100), conexao("d", null)]);
    expect(ordem.map((c) => c.uid)).toEqual(["a", "d", "b", "c"]);
  });
  it("não altera a lista recebida", () => {
    const lista = [conexao("b", 2), conexao("a", 1)];
    ordenarPorTentativa(lista);
    expect(lista.map((c) => c.uid)).toEqual(["b", "a"]);
  });
});

describe("rodarAgenda", () => {
  it("sincroniza todos e soma o que foi importado", async () => {
    const { deps } = dependencias([conexao("u1"), conexao("u2")]);
    const r = await rodarAgenda(deps, 1000);
    expect(r).toMatchObject({ processados: 2, importadas: 2, chaveInvalida: 0, falhas: 0, adiados: 0, paradaPorLimite: false });
    expect(deps.sincronizar).toHaveBeenCalledTimes(2);
  });

  it("chave recusada marca o usuário, avisa e segue para o próximo", async () => {
    const { deps } = dependencias([conexao("u1"), conexao("u2")], {
      sincronizar: vi.fn(async (uid: string) => {
        if (uid === "u1") throw new HttpsError("failed-precondition", "chave recusada");
        return { importadas: 3 };
      }),
    });
    const r = await rodarAgenda(deps, 1000);
    expect(r).toMatchObject({ processados: 2, importadas: 3, chaveInvalida: 1 });
    expect(deps.marcarChaveInvalida).toHaveBeenCalledWith("u1");
    expect(deps.avisarChaveInvalida).toHaveBeenCalledWith("u1");
    expect(deps.registrarFalha).not.toHaveBeenCalled();
  });

  it("falha comum só é registrada e não derruba os demais", async () => {
    const { deps } = dependencias([conexao("u1"), conexao("u2")], {
      sincronizar: vi.fn(async (uid: string) => {
        if (uid === "u1") throw new Error("rede");
        return { importadas: 1 };
      }),
    });
    const r = await rodarAgenda(deps, 1000);
    expect(r).toMatchObject({ processados: 2, falhas: 1, importadas: 1 });
    expect(deps.registrarFalha).toHaveBeenCalledWith("u1");
    expect(deps.marcarChaveInvalida).not.toHaveBeenCalled();
  });

  it("o limite de requisições do intervals.icu interrompe a rodada e adia os que faltam", async () => {
    const { deps } = dependencias([conexao("u1"), conexao("u2"), conexao("u3")], {
      sincronizar: vi.fn(async (uid: string) => {
        if (uid === "u2") throw new HttpsError("resource-exhausted", "espere");
        return { importadas: 1 };
      }),
    });
    const r = await rodarAgenda(deps, 1000);
    expect(r).toMatchObject({ processados: 1, importadas: 1, adiados: 2, paradaPorLimite: true });
    expect(deps.sincronizar).toHaveBeenCalledTimes(2);
  });

  it("para de começar usuários novos quando o orçamento de tempo acaba", async () => {
    let avancar = (_ms: number): number => 0;
    const ctx = dependencias([conexao("u1"), conexao("u2"), conexao("u3")], {
      sincronizar: vi.fn(async () => {
        avancar(600);
        return { importadas: 0 };
      }),
    });
    avancar = ctx.avancar;
    const r = await rodarAgenda(ctx.deps, 1000);
    expect(r).toMatchObject({ processados: 2, adiados: 1, paradaPorLimite: false });
  });

  it("sem conexões, não faz nada", async () => {
    const { deps } = dependencias([]);
    expect(await rodarAgenda(deps, 1000)).toMatchObject({ processados: 0, adiados: 0 });
  });

  it("falha ao gravar o status não interrompe a rodada", async () => {
    const { deps } = dependencias([conexao("u1"), conexao("u2")], {
      sincronizar: vi.fn(async (uid: string) => {
        if (uid === "u1") throw new HttpsError("failed-precondition", "chave");
        return { importadas: 1 };
      }),
      marcarChaveInvalida: vi.fn(async () => {
        throw new Error("firestore fora do ar");
      }),
    });
    const r = await rodarAgenda(deps, 1000);
    expect(r).toMatchObject({ processados: 2, chaveInvalida: 1, importadas: 1 });
  });
});
