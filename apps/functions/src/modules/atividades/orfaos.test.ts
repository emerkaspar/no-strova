import { describe, expect, it } from "vitest";
import { IDADE_MINIMA_ORFAO_MS, lerCaminho, limparOrfaos } from "./orfaos";

const AGORA = Date.UTC(2026, 10, 10, 12);
const velho = AGORA - IDADE_MINIMA_ORFAO_MS - 1000;
const novo = AGORA - 3600 * 1000;

function dependencias(arquivos: Array<{ caminho: string; criadoEmMs: number }>, atividades: Record<string, string>) {
  const apagados: string[] = [];
  return {
    apagados,
    deps: {
      listar: async () => arquivos,
      donoDaAtividade: async (id: string) => atividades[id] ?? null,
      apagar: async (c: string) => {
        apagados.push(c);
      },
    },
  };
}

describe("lerCaminho", () => {
  it("aceita só o padrão atividades/{uid}/{id}/original.{fit|gpx|tcx}", () => {
    expect(lerCaminho("atividades/u1/abcdef123456/original.fit")).toEqual({ uid: "u1", atividadeId: "abcdef123456" });
    expect(lerCaminho("atividades/u1/curto/original.fit")).toBeNull();
    expect(lerCaminho("atividades/u1/abcdef123456/original.exe")).toBeNull();
    expect(lerCaminho("outra/u1/abcdef123456/original.fit")).toBeNull();
    expect(lerCaminho("atividades/u1/abcdef123456/original.fit/extra")).toBeNull();
  });
});

describe("limparOrfaos", () => {
  it("apaga só arquivo antigo sem atividade", async () => {
    const { deps, apagados } = dependencias(
      [
        { caminho: "atividades/u1/orfao000001/original.fit", criadoEmMs: velho },
        { caminho: "atividades/u1/comatividade1/original.gpx", criadoEmMs: velho },
        { caminho: "atividades/u1/recente00001/original.tcx", criadoEmMs: novo },
      ],
      { comatividade1: "u1" },
    );
    expect(await limparOrfaos(deps, AGORA)).toBe(1);
    expect(apagados).toEqual(["atividades/u1/orfao000001/original.fit"]);
  });

  it("não protege o arquivo se a atividade do mesmo id pertence a outro usuário", async () => {
    const { deps, apagados } = dependencias([{ caminho: "atividades/u1/idemprestado1/original.fit", criadoEmMs: velho }], { idemprestado1: "u2" });
    expect(await limparOrfaos(deps, AGORA)).toBe(1);
    expect(apagados).toHaveLength(1);
  });

  it("ignora caminhos fora do padrão e arquivos com data inválida", async () => {
    const { deps, apagados } = dependencias(
      [
        { caminho: "atividades/lixo.txt", criadoEmMs: velho },
        { caminho: "atividades/u1/orfao000002/original.fit", criadoEmMs: Number.NaN },
      ],
      {},
    );
    expect(await limparOrfaos(deps, AGORA)).toBe(0);
    expect(apagados).toEqual([]);
  });

  it("no limite de 24 h exatas, já remove", async () => {
    const { deps } = dependencias([{ caminho: "atividades/u1/orfao000003/original.fit", criadoEmMs: AGORA - IDADE_MINIMA_ORFAO_MS }], {});
    expect(await limparOrfaos(deps, AGORA)).toBe(1);
  });
});
