import { excluirDocumento, gravarDocumento, observarConsulta } from '../core/db.js';

const COLECAO = 'configsAtleta';

/** Um documento por vigência: o id é determinístico, então salvar a mesma data substitui a configuração. */
export function idConfig(uid, vigenteDesde) {
  return `${uid}_${vigenteDesde.replaceAll('-', '')}`;
}

/** Configurações do atleta, da mais recente para a mais antiga. */
export function observarConfigs(uid, aoDados, aoErro) {
  return observarConsulta(
    COLECAO,
    { onde: [['userId', '==', uid]], ordenarPor: [['vigenteDesde', 'desc']] },
    aoDados,
    aoErro,
  );
}

export function salvarConfig(uid, valores) {
  return gravarDocumento(`${COLECAO}/${idConfig(uid, valores.vigenteDesde)}`, { userId: uid, ...valores });
}

export function excluirConfig(id) {
  return excluirDocumento(`${COLECAO}/${id}`);
}
