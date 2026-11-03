import type { ConfigAtleta } from "@no-strova/domain";
import { describe, expect, it } from "vitest";
import { amostraDaAtividade, decidirMudanca } from "./calibracao";

const config: ConfigAtleta = { id: "c1", vigenteDesde: "2026-01-01", fcMax: 190, fcRepouso: 50, lthr: 170, sexo: "masculino", pesoKg: 75, alturaCm: 178 };
const atividade = (extra: Record<string, unknown> = {}) => ({
  esporte: "ciclismo",
  data: "2026-10-01",
  hrss: 60,
  hrssOrigem: "fc",
  fcMedia: 145,
  tempoMovimentoS: 3600,
  alertas: [],
  ...extra,
});

describe("amostraDaAtividade", () => {
  it("usa a configuração vigente na data da atividade para achar a zona", () => {
    expect(amostraDaAtividade("a1", atividade(), [config])).toEqual({ chave: "ciclismo_Z2", id: "a1", data: "2026-10-01", v: 60 });
  });

  it("atividade anterior à primeira vigência, sem HRSS pela FC ou inexistente: null", () => {
    expect(amostraDaAtividade("a1", atividade({ data: "2025-12-31" }), [config])).toBeNull();
    expect(amostraDaAtividade("a1", atividade({ hrssOrigem: "zona" }), [config])).toBeNull();
    expect(amostraDaAtividade("a1", undefined, [config])).toBeNull();
  });
});

describe("decidirMudanca", () => {
  it("criar atividade que conta: grava a amostra nova", () => {
    const m = decidirMudanca("a1", undefined, atividade(), [config]);
    expect(m.gravar).toBe(true);
    expect(m.amostra?.chave).toBe("ciclismo_Z2");
  });

  it("excluir atividade que contava: grava (remove a amostra)", () => {
    const m = decidirMudanca("a1", atividade(), undefined, [config]);
    expect(m).toMatchObject({ gravar: true, amostra: null, removerId: "a1" });
  });

  it("atividade que nunca conta (HRSS estimado pela zona): não grava", () => {
    expect(decidirMudanca("a1", atividade({ hrssOrigem: "zona" }), atividade({ hrssOrigem: "zona", hrss: 61 }), [config]).gravar).toBe(false);
  });

  it("mudança que não altera a amostra (por exemplo, só calorias): não grava", () => {
    expect(decidirMudanca("a1", atividade({ calorias: 500 }), atividade({ calorias: 520 }), [config]).gravar).toBe(false);
  });

  it("recálculo que muda o HRSS: grava a amostra nova", () => {
    expect(decidirMudanca("a1", atividade(), atividade({ hrss: 66 }), [config]).gravar).toBe(true);
  });
});
