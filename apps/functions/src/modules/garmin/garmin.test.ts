import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { baixarArquivoZip, extrairFit, extrairItens, GarminErroApi, listarAtividades, obterToken } from "./garmin.cliente";
import { criptografar, descriptografar } from "./garmin.cripto";

/** Monta um ZIP mínimo (suficiente para o leitor). */
function montarZip(arquivos: Array<{ nome: string; conteudo: Buffer; metodo: 0 | 8 }>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome);
    const dados = a.metodo === 8 ? deflateRawSync(a.conteudo) : a.conteudo;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(a.metodo, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(a.conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(a.metodo, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(a.conteudo.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);
    deslocamento += 30 + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

describe("extrairFit", () => {
  const fit = Buffer.from("conteudo-fit-de-teste".repeat(20));

  it("lê um .fit comprimido (deflate)", () => {
    const zip = montarZip([{ nome: "123_ACTIVITY.fit", conteudo: fit, metodo: 8 }]);
    expect(extrairFit(zip, 1024 * 1024)?.equals(fit)).toBe(true);
  });

  it("lê um .fit armazenado e ignora outros arquivos", () => {
    const zip = montarZip([
      { nome: "leia-me.txt", conteudo: Buffer.from("oi"), metodo: 0 },
      { nome: "123.FIT", conteudo: fit, metodo: 0 },
    ]);
    expect(extrairFit(zip, 1024 * 1024)?.equals(fit)).toBe(true);
  });

  it("devolve null sem .fit, acima do limite ou com arquivo que não é ZIP", () => {
    expect(extrairFit(montarZip([{ nome: "a.gpx", conteudo: fit, metodo: 0 }]), 1024 * 1024)).toBeNull();
    expect(extrairFit(montarZip([{ nome: "a.fit", conteudo: fit, metodo: 8 }]), 10)).toBeNull();
    expect(extrairFit(Buffer.from("isto não é um zip de verdade, só texto"), 1024)).toBeNull();
  });
});

describe("extrairItens", () => {
  it("aceita lista na raiz ou dentro de um objeto e só ids válidos", () => {
    expect(extrairItens([{ activityId: 11 }, { activityId: "22" }, { activityId: -1 }, {}, null]).itens).toEqual([{ id: "11" }, { id: "22" }]);
    expect(extrairItens({ activities: [{ activityId: 5 }] }).itens).toEqual([{ id: "5" }]);
  });

  it("conta o total da página mesmo quando nenhum item é reconhecido", () => {
    expect(extrairItens([{ outro: 1 }])).toEqual({ itens: [], total: 1 });
    expect(extrairItens("lixo")).toEqual({ itens: [], total: 0 });
  });
});

function resposta(corpo: BodyInit | null, status = 200): Response {
  return new Response(corpo, { status });
}

describe("chamadas à API", () => {
  it("troca a chave por token com o cabeçalho ApiKey", async () => {
    const f = vi.fn().mockResolvedValue(resposta("  eyJ.token.x\n"));
    expect(await obterToken("minha-chave-secreta-123", f)).toBe("eyJ.token.x");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("ApiKey minha-chave-secreta-123");
  });

  it("propaga o status quando o Garmin recusa", async () => {
    const f = vi.fn().mockResolvedValue(resposta("nope", 401));
    await expect(obterToken("x".repeat(20), f)).rejects.toMatchObject({ status: 401 });
    await expect(obterToken("x".repeat(20), f)).rejects.toBeInstanceOf(GarminErroApi);
  });

  it("lista com os parâmetros de paginação e período", async () => {
    const f = vi.fn().mockResolvedValue(resposta("[]"));
    await listarAtividades("tok", { inicio: 10, limite: 10, de: "2026-10-01", ate: "2026-11-05" }, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain("/activitylist-service/activities/search/activities?");
    expect(url).toContain("start=10");
    expect(url).toContain("limit=10");
    expect(url).toContain("startDate=2026-10-01");
    expect(url).toContain("endDate=2026-11-05");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("baixa o arquivo, recusa id inválido e resposta vazia", async () => {
    const f = vi.fn().mockResolvedValue(resposta(new Uint8Array([1, 2, 3])));
    expect((await baixarArquivoZip("tok", "123", f)).length).toBe(3);
    expect(f.mock.calls[0][0]).toBe("https://personal.connectapi.garmin.com/download-service/files/activity/123");
    await expect(baixarArquivoZip("tok", "../x", f)).rejects.toBeInstanceOf(GarminErroApi);
    const vazio = vi.fn().mockResolvedValue(resposta(new Uint8Array([])));
    await expect(baixarArquivoZip("tok", "123", vazio)).rejects.toBeInstanceOf(GarminErroApi);
  });
});

describe("criptografia da chave", () => {
  it("vai e volta, e não é determinística", () => {
    const a = criptografar("chave-do-garmin", "segredo-longo");
    expect(a).not.toContain("chave-do-garmin");
    expect(criptografar("chave-do-garmin", "segredo-longo")).not.toBe(a);
    expect(descriptografar(a, "segredo-longo")).toBe("chave-do-garmin");
  });

  it("falha com segredo errado ou conteúdo adulterado", () => {
    const a = criptografar("chave-do-garmin", "segredo-longo");
    expect(() => descriptografar(a, "outro-segredo")).toThrow();
    expect(() => descriptografar(`${a.slice(0, -2)}AA`, "segredo-longo")).toThrow();
    expect(() => descriptografar("v2:a:b:c", "segredo-longo")).toThrow();
  });
});
