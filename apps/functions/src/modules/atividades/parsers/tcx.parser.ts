import { montarAmostras, numero, type Ponto } from "./amostra";
import { ArquivoInvalidoError, type ArquivoLido } from "./tipos";
import { criarParserXml, filho, instante } from "./xml";

const lerXml = criarParserXml(["Activity", "Lap", "Track", "Trackpoint"]);

type No = Record<string, unknown>;

export function lerTcx(conteudo: Buffer): ArquivoLido {
  const raiz = filho(lerXml(conteudo.toString("utf8")), "TrainingCenterDatabase");
  const atividade = (filho(filho(raiz, "Activities"), "Activity") as No[] | undefined)?.[0];
  if (!atividade) throw new ArquivoInvalidoError("O arquivo .tcx não contém nenhuma atividade.");

  const pontos: Ponto[] = [];
  let calorias = 0;
  for (const volta of (filho(atividade, "Lap") as No[] | undefined) ?? []) {
    calorias += numero(filho(volta, "Calories")) ?? 0;
    for (const trilha of (filho(volta, "Track") as No[] | undefined) ?? []) {
      for (const tp of (filho(trilha, "Trackpoint") as No[] | undefined) ?? []) {
        const posicao = filho(tp, "Position");
        const extensao = filho(filho(tp, "Extensions"), "TPX");
        pontos.push({
          ms: instante(filho(tp, "Time")),
          fc: numero(filho(filho(tp, "HeartRateBpm"), "Value")),
          vel: numero(filho(extensao, "Speed")),
          dist: numero(filho(tp, "DistanceMeters")),
          alt: numero(filho(tp, "AltitudeMeters")),
          lat: numero(filho(posicao, "LatitudeDegrees")),
          lon: numero(filho(posicao, "LongitudeDegrees")),
        });
      }
    }
  }

  const montado = montarAmostras(pontos.filter((p) => Number.isFinite(p.ms)));
  if (!montado) throw new ArquivoInvalidoError("O arquivo .tcx não tem pontos com data e hora.");
  const esporte = (atividade as No)["@_Sport"];
  return {
    ...montado,
    esporteArquivo: typeof esporte === "string" ? esporte : null,
    calorias: calorias > 0 ? Math.round(calorias) : null,
  };
}
