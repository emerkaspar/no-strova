/** Linha do painel de adesão: só booleanos, datas (ms) e contagens. Nunca chaves nem dados de saúde. */
export interface LinhaAdesao {
  uid: string;
  nome: string;
  email: string;
  role: string;
  aprovado: boolean;
  ativo: boolean;
  criadoEm: number | null;
  /** Último login ou renovação de sessão registrado no Auth. */
  ultimoAcesso: number | null;
  onboarding: string | null;
  intervals: {
    status: string | null;
    conectadaEm: number | null;
    ultimaSincronizacao: number | null;
    falhasSeguidas: number;
  } | null;
  garmin: {
    conectado: boolean;
    expiraEm: number | null;
    ultimaSincronizacao: number | null;
  } | null;
  atividades: {
    total: number;
    ultimaEm: number | null;
    porFonte: { garmin: number; intervals: number; manual: number };
  };
  treinosPlanejados: { total: number; porIa: number };
  push: boolean;
}
