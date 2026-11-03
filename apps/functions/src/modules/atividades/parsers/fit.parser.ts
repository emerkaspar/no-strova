import FitParser from "fit-file-parser";
import { montarAmostras, numero, type Ponto } from "./amostra";
import { ArquivoInvalidoError, type ArquivoLido } from "./tipos";

interface RegistroFit {
  timestamp?: Date | string | number;
  heart_rate?: number;
  speed?: number;
  enhanced_speed?: number;
  distance?: number;
  altitude?: number;
  enhanced_altitude?: number;
  position_lat?: number;
  position_long?: number;
}

interface SessaoFit {
  sport?: string;
  total_calories?: number;
}

export async function lerFit(conteudo: Buffer): Promise<ArquivoLido> {
  const parser = new FitParser({ force: true, speedUnit: "m/s", lengthUnit: "m", mode: "list" });
  const bytes = new Uint8Array(conteudo);
  let fit: { records?: RegistroFit[]; sessions?: SessaoFit[] };
  try {
    fit = (await parser.parseAsync(bytes.buffer as ArrayBuffer)) as unknown as typeof fit;
  } catch {
    throw new ArquivoInvalidoError("O arquivo .fit está corrompido ou não é um arquivo FIT válido.");
  }

  const pontos: Ponto[] = (fit.records ?? [])
    .map((r) => ({
      ms: r.timestamp === undefined ? Number.NaN : new Date(r.timestamp).getTime(),
      fc: numero(r.heart_rate),
      vel: numero(r.enhanced_speed ?? r.speed),
      dist: numero(r.distance),
      alt: numero(r.enhanced_altitude ?? r.altitude),
      lat: numero(r.position_lat),
      lon: numero(r.position_long),
    }))
    .filter((p) => Number.isFinite(p.ms));

  const montado = montarAmostras(pontos);
  if (!montado) throw new ArquivoInvalidoError("O arquivo .fit não contém registros de tempo da atividade.");

  const sessoes = fit.sessions ?? [];
  const calorias = sessoes.reduce((soma, s) => soma + (numero(s.total_calories) ?? 0), 0);
  return {
    ...montado,
    esporteArquivo: sessoes[0]?.sport ?? null,
    calorias: calorias > 0 ? Math.round(calorias) : null,
  };
}
