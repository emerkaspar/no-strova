import { describe, expect, it, vi } from "vitest";
import { lerBemEstar, listarBemEstar } from "./intervals.cliente";

describe("lerBemEstar", () => {
  it("lê passos e sono do dia", () => {
    expect(lerBemEstar({ id: "2026-11-16", steps: 8123, sleepSecs: 25200 })).toEqual({ data: "2026-11-16", passos: 8123, sonoSegundos: 25200 });
  });

  it("aceita só um dos dois e trata zero como ausente", () => {
    expect(lerBemEstar({ id: "2026-11-16", steps: 0, sleepSecs: 20000 })).toEqual({ data: "2026-11-16", passos: null, sonoSegundos: 20000 });
  });

  it("descarta dia sem os dois, sem data válida ou com valores absurdos", () => {
    expect(lerBemEstar({ id: "2026-11-16", weight: 80 })).toBeNull();
    expect(lerBemEstar({ id: "x", steps: 100 })).toBeNull();
    expect(lerBemEstar({ id: "2026-11-16", steps: 9e9, sleepSecs: -1 })).toBeNull();
    expect(lerBemEstar(null)).toBeNull();
  });
});

describe("listarBemEstar", () => {
  it("consulta o endpoint de wellness do período", async () => {
    const requisitor = vi.fn().mockResolvedValue({ status: 200, json: async () => [{ id: "2026-11-16", steps: 5000 }, { id: "2026-11-15" }] });
    const r = await listarBemEstar("chave-de-teste", { de: "2026-11-10", ate: "2026-11-17" }, requisitor);
    expect(requisitor.mock.calls[0][0]).toBe("https://intervals.icu/api/v1/athlete/0/wellness?oldest=2026-11-10&newest=2026-11-17");
    expect(r).toEqual([{ data: "2026-11-16", passos: 5000, sonoSegundos: null }]);
  });
});
