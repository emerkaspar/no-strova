import { gravarDocumento, observarDocumento } from '../core/db.js';

/** Resumo de calibração da estimativa de HRSS (escrito só pelo servidor): { chaves: { esporte_zona: { n, mediana } } } ou null. */
export function observarCalibracao(uid, aoDados, aoErro) {
  return observarDocumento(`calibracoes/${uid}`, aoDados, aoErro);
}

/** Preferências do usuário: { calibracaoAtiva } ou null (sem documento, a calibração vale). */
export function observarPreferencias(uid, aoDados, aoErro) {
  return observarDocumento(`preferencias/${uid}`, aoDados, aoErro);
}

export function salvarPreferencias(uid, valores) {
  return gravarDocumento(`preferencias/${uid}`, { userId: uid, ...valores });
}
