import type { Amostra } from "./amostra";

export interface ArquivoLido {
  /** Instante do primeiro ponto (ms desde 1970). */
  inicioMs: number;
  amostras: Amostra[];
  /** Nome do esporte como vem no arquivo (o mapeamento para o app é feito no serviço). */
  esporteArquivo: string | null;
  /** Calorias gravadas pelo aparelho, quando existirem. */
  calorias: number | null;
}

export class ArquivoInvalidoError extends Error {}
