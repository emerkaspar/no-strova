import { XMLParser } from "fast-xml-parser";
import { ArquivoInvalidoError } from "./tipos";

type No = Record<string, unknown>;

/** Parser XML sem prefixo de namespace e sem expansão de entidades. Tags de repetição sempre viram lista. */
export function criarParserXml(tagsLista: string[]): (texto: string) => No {
  const lista = new Set(tagsLista);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (nome) => lista.has(nome),
  });
  return (texto) => {
    try {
      return parser.parse(texto) as No;
    } catch {
      throw new ArquivoInvalidoError("O arquivo não é um XML válido.");
    }
  };
}

export function filho(no: unknown, nome: string): unknown {
  return typeof no === "object" && no !== null ? (no as No)[nome] : undefined;
}

export function texto(no: unknown): string | undefined {
  return typeof no === "string" ? no : undefined;
}

export function instante(valor: unknown): number {
  return typeof valor === "string" ? Date.parse(valor) : Number.NaN;
}
