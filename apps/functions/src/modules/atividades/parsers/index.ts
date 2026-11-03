import { lerFit } from "./fit.parser";
import { lerGpx } from "./gpx.parser";
import { lerTcx } from "./tcx.parser";
import type { ArquivoLido } from "./tipos";

export { ArquivoInvalidoError } from "./tipos";
export type { ArquivoLido } from "./tipos";

export const EXTENSOES = ["fit", "gpx", "tcx"] as const;
export type Extensao = (typeof EXTENSOES)[number];

export function extensaoValida(valor: unknown): valor is Extensao {
  return typeof valor === "string" && (EXTENSOES as readonly string[]).includes(valor);
}

export async function lerArquivo(conteudo: Buffer, extensao: Extensao): Promise<ArquivoLido> {
  switch (extensao) {
    case "fit":
      return lerFit(conteudo);
    case "gpx":
      return lerGpx(conteudo);
    case "tcx":
      return lerTcx(conteudo);
  }
}
