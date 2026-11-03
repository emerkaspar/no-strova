import type { ConfigAtleta } from "@no-strova/domain";
import { describe, expect, it } from "vitest";
import { calcularCalorias, calcularEstresse } from "./estresse";

const config: ConfigAtleta = {
  id: "c1",
  vigenteDesde: "2026-01-01",
  fcMax: 190,
  fcRepouso: 50,
  lthr: 170,
  sexo: "masculino",
  pesoKg: 75,
  alturaCm: 178,
};
const base = { data: "2026-11-01", fcMedia: null, fcMax: null, zona: null, hrssManual: null, tempoMovimentoS: 3600, config };

describe("calcularEstresse", () => {
  it("usa a FC média quando há (origem fc) e registra a configuração usada", () => {
    const r = calcularEstresse({ ...base, fcMedia: 150, fcMax: 180 });
    expect(r.hrssOrigem).toBe("fc");
    expect(r.hrss).toBeCloseTo(63.34, 1);
    expect(r.configIdUsada).toBe("c1");
    expect(r.alertas).toEqual([]);
  });

  it("sem FC, estima pela zona", () => {
    const r = calcularEstresse({ ...base, zona: "Z2" });
    expect(r.hrssOrigem).toBe("zona");
    expect(r.hrss).toBeGreaterThan(0);
  });

  it("HRSS informado vale no lugar do cálculo, mesmo sem configuração", () => {
    const r = calcularEstresse({ ...base, hrssManual: 42, fcMedia: 150, config: null });
    expect(r).toMatchObject({ hrss: 42, hrssOrigem: "manual", configIdUsada: null });
    expect(r.alertas).toEqual([]);
  });

  it("sem configuração vigente, não calcula e avisa", () => {
    const r = calcularEstresse({ ...base, fcMedia: 150, config: null });
    expect(r).toMatchObject({ hrss: null, hrssOrigem: null, alertas: ["semConfigFc"] });
  });

  it("sem FC nem zona, não calcula e avisa", () => {
    expect(calcularEstresse(base).alertas).toEqual(["semFc"]);
  });

  it("alerta HRSS por hora anormal e FC acima da máxima configurada", () => {
    const r = calcularEstresse({ ...base, fcMedia: 250, fcMax: 250, tempoMovimentoS: 3600 });
    expect(r.alertas).toContain("hrssAnormal");
    expect(r.alertas).toContain("fcAcimaDaMaxima");
  });
});

describe("calcularCalorias", () => {
  const entrada = { data: "2026-11-01", fcMedia: 150, zona: null, duracaoS: 3600, config, dataNascimento: "1982-04-30", caloriasDoArquivo: null, caloriasInformadas: null };

  it("prioriza as do arquivo, depois as informadas", () => {
    expect(calcularCalorias({ ...entrada, caloriasDoArquivo: 900, caloriasInformadas: 500 })).toEqual({ calorias: 900, caloriasOrigem: "arquivo" });
    expect(calcularCalorias({ ...entrada, caloriasInformadas: 500 })).toEqual({ calorias: 500, caloriasOrigem: "informada" });
  });

  it("estima por Keytel e rotula como estimada", () => {
    const r = calcularCalorias(entrada);
    expect(r.caloriasOrigem).toBe("estimada");
    expect(r.calorias).toBeGreaterThan(600);
    expect(r.calorias).toBeLessThan(1100);
  });

  it("estima pela FC presumida da zona quando não há FC", () => {
    expect(calcularCalorias({ ...entrada, fcMedia: null, zona: "Z2" }).caloriasOrigem).toBe("estimada");
  });

  it("sem data de nascimento ou sem configuração, não estima", () => {
    expect(calcularCalorias({ ...entrada, dataNascimento: null })).toEqual({ calorias: null, caloriasOrigem: null });
    expect(calcularCalorias({ ...entrada, config: null })).toEqual({ calorias: null, caloriasOrigem: null });
  });
});
