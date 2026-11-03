import { describe, expect, it } from "vitest";
import { agregarDia, idEstresseDiario } from "./estresse.service";

describe("idEstresseDiario", () => {
  it("combina usuário e dia sem hífens", () => {
    expect(idEstresseDiario("u1", "2026-11-03")).toBe("u1_20261103");
  });
});

describe("agregarDia", () => {
  it("soma HRSS e calorias das atividades do dia", () => {
    expect(agregarDia([{ hrss: 55.5, calorias: 800 }, { hrss: 40.25, calorias: 300 }])).toEqual({ estresse: 95.75, kcal: 1100, qtdAtividades: 2 });
  });

  it("atividade sem HRSS ou sem calorias conta na quantidade, sem somar", () => {
    expect(agregarDia([{ hrss: null, calorias: null }, { hrss: 30 }])).toEqual({ estresse: 30, kcal: 0, qtdAtividades: 2 });
  });

  it("arredonda o estresse a 2 casas e as calorias a inteiros", () => {
    expect(agregarDia([{ hrss: 10.004, calorias: 100.4 }, { hrss: 10.004, calorias: 100.4 }])).toEqual({ estresse: 20.01, kcal: 201, qtdAtividades: 2 });
  });
});
