import { mesclarDocumento, observarDocumento } from '../core/db.js';

/** Resumo de calibração da estimativa de HRSS (escrito só pelo servidor): { chaves: { esporte_zona: { n, mediana } } } ou null. */
export function observarCalibracao(uid, aoDados, aoErro) {
  return observarDocumento(`calibracoes/${uid}`, aoDados, aoErro);
}

/** Preferências do usuário: { calibracaoAtiva?, nivelTreinos? } ou null (sem documento, a calibração vale). */
export function observarPreferencias(uid, aoDados, aoErro) {
  return observarDocumento(`preferencias/${uid}`, aoDados, aoErro);
}

/** Mescla com o que já está salvo: mudar uma preferência não apaga as outras. */
export function salvarPreferencias(uid, valores) {
  return mesclarDocumento(`preferencias/${uid}`, { userId: uid, ...valores });
}
