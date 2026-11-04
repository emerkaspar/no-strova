import { lerDocumento, mesclarDocumento, observarDocumento } from '../core/db.js';

/** Resumo de calibração da estimativa de HRSS (escrito só pelo servidor): { chaves: { esporte_zona: { n, mediana } } } ou null. */
export function observarCalibracao(uid, aoDados, aoErro) {
  return observarDocumento(`calibracoes/${uid}`, aoDados, aoErro);
}

/**
 * Preferências do usuário ou null (sem documento, a calibração vale): { calibracaoAtiva?, nivelTreinos?, diasTreino?,
 * diaLongao?, horasSemana?, esportePrincipal?, onboarding? }.
 */
export function observarPreferencias(uid, aoDados, aoErro) {
  return observarDocumento(`preferencias/${uid}`, aoDados, aoErro);
}

/** Leitura única das preferências (para pré-preencher formulários). */
export function lerPreferencias(uid) {
  return lerDocumento(`preferencias/${uid}`);
}

/** Mescla com o que já está salvo: mudar uma preferência não apaga as outras. */
export function salvarPreferencias(uid, valores) {
  return mesclarDocumento(`preferencias/${uid}`, { userId: uid, ...valores });
}
