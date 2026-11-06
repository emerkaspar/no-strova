import { lerDocumento, observarConsulta } from '../core/db.js';

/** Atividades do usuário, da mais recente para a mais antiga. Quem chama cancela o listener ao sair da tela. */
export function observarAtividades(uid, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid]], ordenarPor: [['data', 'desc']], limite: 1000 },
    aoDados,
    aoErro,
  );
}

export function lerAtividade(id) {
  return lerDocumento(`atividades/${id}`);
}

/** Série de FC reduzida ({ t: segundos[], fc: bpm[] }) ou null. */
export function lerSerieFc(id) {
  return lerDocumento(`atividades/${id}/series/fc`);
}

/** As N atividades mais recentes. Quem chama cancela o listener ao sair da tela. */
export function observarUltimasAtividades(uid, quantidade, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid]], ordenarPor: [['data', 'desc']], limite: quantidade },
    aoDados,
    aoErro,
  );
}

/** Atividades de uma data (yyyy-mm-dd) em diante, da mais recente para a mais antiga. */
export function observarAtividadesDesde(uid, dataInicio, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid], ['data', '>=', dataInicio]], ordenarPor: [['data', 'desc']], limite: 200 },
    aoDados,
    aoErro,
  );
}

/** Série detalhada ({ t, dist, alt, vel, fc, lat, lon }) para o gráfico e o mapa, ou null (atividade sem arquivo ou ainda não gerada). */
export function lerSerieDetalhe(id) {
  return lerDocumento(`atividades/${id}/series/detalhe`);
}

/** Voltas gravadas pelo aparelho ([{ iniS, fimS }], em segundos desde o início), ou [] (sem arquivo .fit com voltas). */
export async function lerVoltas(id) {
  const doc = await lerDocumento(`atividades/${id}/series/voltas`);
  return Array.isArray(doc?.voltas) ? doc.voltas : [];
}

/**
 * Atividades que estão em algum trajeto de treino (as que têm `trajetoId`), sem ordem: quem chama separa por trajeto e ordena.
 * Lê só essas atividades, não o histórico inteiro. Quem chama cancela o listener ao sair da tela.
 */
export function observarAtividadesComTrajeto(uid, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid], ['trajetoId', '>', '']], ordenarPor: [['trajetoId', 'asc']], limite: 3000 },
    aoDados,
    aoErro,
  );
}

/** Atividades de uma data (yyyy-mm-dd) em diante para a progressão do ano (vários anos, então o limite é maior que o do Início). */
export function observarAtividadesParaProgressao(uid, dataInicio, aoDados, aoErro) {
  return observarConsulta(
    'atividades',
    { onde: [['userId', '==', uid], ['data', '>=', dataInicio]], ordenarPor: [['data', 'desc']], limite: 3000 },
    aoDados,
    aoErro,
  );
}
