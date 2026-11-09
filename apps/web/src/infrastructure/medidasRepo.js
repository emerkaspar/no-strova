import { carimboDeServidor, excluirDocumento, gravarDocumento, observarConsulta } from '../core/db.js';

const MEDIDAS = 'medidas';

/** Id do registro de medidas de um dia: um por dia, então gravar de novo na mesma data substitui o anterior. */
export const idDasMedidas = (uid, data) => `${uid}_${data.replaceAll('-', '')}`;

/** Medidas do usuário em ordem de data. Cancele o listener ao sair da tela. */
export function observarMedidas(uid, aoDados, aoErro) {
  return observarConsulta(MEDIDAS, { onde: [['userId', '==', uid]], ordenarPor: [['data', 'asc']], limite: 500 }, aoDados, aoErro);
}

/** Grava (ou substitui) o registro do dia. `valores`: { data, ...medidas }, já validados. */
export function gravarMedidas(uid, valores) {
  return gravarDocumento(`${MEDIDAS}/${idDasMedidas(uid, valores.data)}`, { userId: uid, ...valores, criadoEm: carimboDeServidor() });
}

export function excluirMedidas(id) {
  return excluirDocumento(`${MEDIDAS}/${id}`);
}
