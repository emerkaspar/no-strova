import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { baixarArquivoOriginal, IntervalsErroApi, listarAtividades, type Requisitor } from "./intervals.cliente";
import { atividadeIdDoIntervals } from "./intervals.service";

const resposta = (status: number, corpo: unknown, bytes?: Buffer): Awaited<ReturnType<Requisitor>> => ({
  status,
  json: async () => corpo,
  arrayBuffer: async () => (bytes ?? Buffer.alloc(0)).buffer.slice((bytes ?? Buffer.alloc(0)).byteOffset, (bytes ?? Buffer.alloc(0)).byteOffset + (bytes ?? Buffer.alloc(0)).length) as ArrayBuffer,
});

/** Cabeçalho mínimo de um .fit: 14 bytes com ".FIT" nos bytes 8 a 11, mais um pouco de conteúdo. */
const fit = (): Buffer => {
  const b = Buffer.alloc(32);
  b.write(".FIT", 8, "latin1");
  return b;
};

describe("listarAtividades", () => {
  it("lê o período pedido e ordena da mais antiga para a mais recente", async () => {
    const requisitor = vi.fn<Requisitor>(async () =>
      resposta(200, [
        { id: "i2", name: "Pedal da tarde", start_date_local: "2026-11-06T16:00:00", source: "IGPSPORT" },
        { id: "i1", name: "Pedal da manhã", start_date_local: "2026-11-06T07:30:00", source: "IGPSPORT" },
      ]),
    );
    const lista = await listarAtividades("chave", { de: "2026-11-01", ate: "2026-11-09" }, requisitor);
    expect(lista.map((a) => a.id)).toEqual(["i1", "i2"]);
    expect(lista[0]).toMatchObject({ rotulo: "Pedal da manhã em 06/11/2026", temArquivo: true });
    const [url] = requisitor.mock.calls[0];
    expect(url).toContain("/athlete/0/activities?");
    expect(url).toContain("oldest=2026-11-01");
    expect(url).toContain("newest=2026-11-09");
  });

  it("marca as do Strava como sem arquivo e ignora itens inválidos", async () => {
    const lista = await listarAtividades(
      "chave",
      { de: "2026-11-01", ate: "2026-11-09" },
      async () =>
        resposta(200, [
          { id: "i3", start_date_local: "2026-11-05T08:00:00", source: "STRAVA" },
          { id: "i4", start_date_local: "2026-11-05T09:00:00", _note: "STRAVA activities are not available via the API" },
          { id: "../x", start_date_local: "2026-11-05T10:00:00" },
          null,
        ]),
    );
    expect(lista).toHaveLength(2);
    expect(lista.every((a) => !a.temArquivo)).toBe(true);
  });

  it("propaga a recusa da chave", async () => {
    await expect(listarAtividades("ruim", { de: "2026-11-01", ate: "2026-11-09" }, async () => resposta(401, null))).rejects.toMatchObject({ status: 401 });
  });
});

describe("baixarArquivoOriginal", () => {
  it("devolve o .fit puro", async () => {
    const arquivo = await baixarArquivoOriginal("chave", "i1", 1024, async () => resposta(200, null, fit()));
    expect(arquivo?.toString("latin1", 8, 12)).toBe(".FIT");
  });

  it("descompacta gzip", async () => {
    const arquivo = await baixarArquivoOriginal("chave", "i1", 1024, async () => resposta(200, null, gzipSync(fit())));
    expect(arquivo?.toString("latin1", 8, 12)).toBe(".FIT");
  });

  it("devolve null quando não há arquivo (404 ou corpo vazio)", async () => {
    expect(await baixarArquivoOriginal("chave", "i1", 1024, async () => resposta(404, null))).toBeNull();
    expect(await baixarArquivoOriginal("chave", "i1", 1024, async () => resposta(200, null, Buffer.alloc(0)))).toBeNull();
  });

  it("recusa arquivo acima do limite e id inválido, e propaga erro do servidor", async () => {
    await expect(baixarArquivoOriginal("chave", "i1", 10, async () => resposta(200, null, fit()))).rejects.toMatchObject({ status: 413 });
    await expect(baixarArquivoOriginal("chave", "../x", 1024, async () => resposta(200, null, fit()))).rejects.toBeInstanceOf(IntervalsErroApi);
    await expect(baixarArquivoOriginal("chave", "i1", 1024, async () => resposta(429, null))).rejects.toMatchObject({ status: 429 });
  });
});

describe("atividadeIdDoIntervals", () => {
  it("é determinístico e cabe no padrão de identificador de atividade", () => {
    expect(atividadeIdDoIntervals("i123456")).toBe("intervals_i123456");
    expect(atividadeIdDoIntervals("i123456")).toMatch(/^[A-Za-z0-9_-]{8,40}$/);
  });
});
