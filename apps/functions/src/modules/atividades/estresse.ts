import {
  arredondarHrss,
  caloriasKeytel,
  type ConfigAtleta,
  calcularHrss,
  estimarHrssPorZona,
  fcMediaDaZona,
  hrssPorHora,
  idadeNaData,
  LIMITE_HRSS_POR_HORA,
} from "@no-strova/domain";
import { ALERTAS, type OrigemCalorias, type OrigemHrss } from "./atividades.types";

export interface EntradaEstresse {
  data: string;
  fcMedia: number | null;
  fcMax: number | null;
  zona: string | null;
  hrssManual: number | null;
  tempoMovimentoS: number;
  config: ConfigAtleta | null;
}

export interface ResultadoEstresse {
  hrss: number | null;
  hrssOrigem: OrigemHrss | null;
  configIdUsada: string | null;
  alertas: string[];
}

/** HRSS da atividade: informado > pela FC média > estimado pela zona. Funções puras do domain; sem acesso a dados. */
export function calcularEstresse(entrada: EntradaEstresse): ResultadoEstresse {
  const { fcMedia, zona, hrssManual, tempoMovimentoS, config } = entrada;
  const alertas: string[] = [];
  let hrss: number | null = null;
  let hrssOrigem: OrigemHrss | null = null;

  if (hrssManual !== null) {
    hrss = hrssManual;
    hrssOrigem = "manual";
  } else if (!config) {
    alertas.push(ALERTAS.SEM_CONFIG);
  } else if (fcMedia !== null) {
    hrss = calcularHrss({ fcMedia, tempoMovimentoS, config });
    hrssOrigem = "fc";
  } else if (zona !== null) {
    hrss = estimarHrssPorZona({ zona, duracaoS: tempoMovimentoS, config });
    hrssOrigem = "zona";
  } else {
    alertas.push(ALERTAS.SEM_FC);
  }

  if (hrss !== null && (hrssPorHora(hrss, tempoMovimentoS) ?? 0) > LIMITE_HRSS_POR_HORA) {
    alertas.push(ALERTAS.HRSS_ANORMAL);
  }
  if (config && entrada.fcMax !== null && entrada.fcMax > config.fcMax) {
    alertas.push(ALERTAS.FC_ACIMA_MAX);
  }

  return {
    hrss: arredondarHrss(hrss),
    hrssOrigem: hrss === null ? null : hrssOrigem,
    configIdUsada: config?.id ?? null,
    alertas,
  };
}

export interface ResultadoCalorias {
  calorias: number | null;
  caloriasOrigem: OrigemCalorias | null;
}

/** Calorias: as do arquivo ou informadas valem; senão, estimativa de Keytel (rotulada como estimada). */
export function calcularCalorias(entrada: {
  data: string;
  fcMedia: number | null;
  zona: string | null;
  duracaoS: number;
  config: ConfigAtleta | null;
  dataNascimento: string | null;
  caloriasDoArquivo: number | null;
  caloriasInformadas: number | null;
}): ResultadoCalorias {
  if (entrada.caloriasDoArquivo !== null) return { calorias: entrada.caloriasDoArquivo, caloriasOrigem: "arquivo" };
  if (entrada.caloriasInformadas !== null) return { calorias: entrada.caloriasInformadas, caloriasOrigem: "informada" };

  const { config } = entrada;
  const fc = entrada.fcMedia ?? (entrada.zona && config ? fcMediaDaZona(entrada.zona, config) : null);
  const idade = entrada.dataNascimento ? idadeNaData(entrada.dataNascimento, entrada.data) : null;
  if (!config || fc === null || idade === null) return { calorias: null, caloriasOrigem: null };

  const calorias = caloriasKeytel({
    fcMedia: fc,
    pesoKg: config.pesoKg,
    idade,
    sexo: config.sexo,
    duracaoS: entrada.duracaoS,
  });
  return { calorias, caloriasOrigem: calorias === null ? null : "estimada" };
}
