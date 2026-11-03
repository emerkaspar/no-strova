export type OrigemAtividade = "arquivo" | "manual";
export type OrigemHrss = "fc" | "zona" | "manual";
export type OrigemCalorias = "arquivo" | "informada" | "estimada";

/** Alertas gravados na atividade (mostrados ao usuário). */
export const ALERTAS = {
  SEM_CONFIG: "semConfigFc",
  SEM_FC: "semFc",
  HRSS_ANORMAL: "hrssAnormal",
  FC_ACIMA_MAX: "fcAcimaDaMaxima",
} as const;

export interface ResultadoProcessamento {
  atividadeId: string;
  hrss: number | null;
  alertas: string[];
  jaExistia: boolean;
}
