import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Criptografia da chave pessoal do Garmin em repouso (AES-256-GCM). O segredo fica no Secret Manager. */

function chaveDe(segredo: string): Buffer {
  if (!segredo) throw new Error("Segredo de criptografia ausente.");
  return createHash("sha256").update(segredo).digest();
}

export function criptografar(texto: string, segredo: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDe(segredo), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return ["v1", iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function descriptografar(cifrado: string, segredo: string): string {
  const [versao, iv, tag, dados] = cifrado.split(":");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("Formato de chave cifrada desconhecido.");
  const decifra = createDecipheriv("aes-256-gcm", chaveDe(segredo), Buffer.from(iv, "base64"));
  decifra.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
}
