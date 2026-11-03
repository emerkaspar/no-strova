import { montarAmostras, numero, type Ponto } from "./amostra";
import { ArquivoInvalidoError, type ArquivoLido } from "./tipos";
import { criarParserXml, filho, instante, texto } from "./xml";

const lerXml = criarParserXml(["trk", "trkseg", "trkpt"]);

type No = Record<string, unknown>;

export function lerGpx(conteudo: Buffer): ArquivoLido {
  const raiz = filho(lerXml(conteudo.toString("utf8")), "gpx") as No | undefined;
  if (!raiz) throw new ArquivoInvalidoError("O arquivo .gpx não tem o elemento raiz <gpx>.");

  const trilhas = (filho(raiz, "trk") as No[] | undefined) ?? [];
  const pontos: Ponto[] = [];
  for (const trilha of trilhas) {
    for (const segmento of (filho(trilha, "trkseg") as No[] | undefined) ?? []) {
      for (const pt of (filho(segmento, "trkpt") as No[] | undefined) ?? []) {
        const extensao = filho(filho(pt, "extensions"), "TrackPointExtension");
        pontos.push({
          ms: instante(filho(pt, "time")),
          fc: numero(filho(extensao, "hr")),
          alt: numero(filho(pt, "ele")),
          lat: numero((pt as No)["@_lat"]),
          lon: numero((pt as No)["@_lon"]),
        });
      }
    }
  }

  const montado = montarAmostras(pontos.filter((p) => Number.isFinite(p.ms)));
  if (!montado) {
    throw new ArquivoInvalidoError("O arquivo .gpx não tem pontos com data e hora.");
  }
  return { ...montado, esporteArquivo: texto(filho(trilhas[0], "type")) ?? null, calorias: null };
}
