import type { Amostra } from "./amostra";

/** Volta gravada pelo aparelho (num treino enviado ao relógio, uma por passo). Tempos em segundos desde o primeiro ponto. */
export interface VoltaLida {
  iniS: number;
  fimS: number;
}

export interface ArquivoLido {
  /** Instante do primeiro ponto (ms desde 1970). */
  inicioMs: number;
  amostras: Amostra[];
  /** Nome do esporte como vem no arquivo (o mapeamento para o app é feito no serviço). */
  esporteArquivo: string | null;
  /** Calorias gravadas pelo aparelho, quando existirem. */
  calorias: number | null;
  /** Voltas do aparelho, quando o arquivo as traz (só .fit). */
  voltas?: VoltaLida[];
}

export class ArquivoInvalidoError extends Error {}
