import { amostraDeCalibracao, type ConfigAtleta, configVigenteEm } from "@no-strova/domain";

type DadosAtividade = Record<string, unknown> | undefined;

interface Amostra {
  chave: string;
  id: string;
  data: string;
  v: number;
}

/** A amostra de calibração de uma atividade (o documento do Firestore), ou null se ela não serve. */
export function amostraDaAtividade(id: string, dados: DadosAtividade, configs: ConfigAtleta[]): Amostra | null {
  if (!dados || typeof dados.data !== "string") return null;
  const config = configVigenteEm(configs, dados.data);
  return amostraDeCalibracao(
    {
      id,
      esporte: dados.esporte as string,
      data: dados.data,
      hrss: dados.hrss as number | null | undefined,
      hrssOrigem: dados.hrssOrigem as string | null | undefined,
      fcMedia: dados.fcMedia as number | null | undefined,
      tempoMovimentoS: dados.tempoMovimentoS as number | undefined,
      duracaoS: dados.duracaoS as number | undefined,
      alertas: Array.isArray(dados.alertas) ? (dados.alertas as string[]) : [],
    },
    config,
  );
}

export interface Mudanca {
  /** Há algo a gravar? Falso quando a atividade não entrava na calibração nem antes nem depois. */
  gravar: boolean;
  removerId: string;
  amostra: Amostra | null;
}

/**
 * O que a mudança de uma atividade (criar, editar, recalcular, excluir) faz na calibração: tira a amostra antiga pelo
 * id e põe a nova. Se nada mudou na amostra, não grava (evita escrita à toa a cada recálculo sem efeito).
 */
export function decidirMudanca(id: string, antes: DadosAtividade, depois: DadosAtividade, configs: ConfigAtleta[]): Mudanca {
  const anterior = amostraDaAtividade(id, antes, configs);
  const nova = amostraDaAtividade(id, depois, configs);
  const igual =
    anterior !== null && nova !== null && anterior.chave === nova.chave && anterior.v === nova.v && anterior.data === nova.data;
  return { gravar: (anterior !== null || nova !== null) && !igual, removerId: id, amostra: nova };
}
