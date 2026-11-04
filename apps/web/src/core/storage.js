import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { app } from './firebase.js';

const storage = getStorage(app);

/**
 * Envia o arquivo original da atividade para atividades/{uid}/{atividadeId}/original.{ext}.
 * As regras do Storage só aceitam esse caminho, .fit/.gpx/.tcx e até 15 MB, e nunca sobrescrevem.
 * @param {(fracao: number) => void} [aoProgresso]
 */
export function enviarArquivoAtividade(uid, atividadeId, extensao, arquivo, aoProgresso) {
  const tarefa = uploadBytesResumable(ref(storage, `atividades/${uid}/${atividadeId}/original.${extensao}`), arquivo, {
    contentType: 'application/octet-stream',
  });
  return new Promise((resolve, reject) => {
    tarefa.on(
      'state_changed',
      (s) => aoProgresso?.(s.totalBytes > 0 ? s.bytesTransferred / s.totalBytes : 0),
      (err) =>
        reject(
          new Error(
            err?.code === 'storage/unauthorized'
              ? 'Não foi possível enviar o arquivo. Confira se é .fit, .gpx ou .tcx de até 15 MB e se o seu acesso está liberado.'
              : 'Falha no envio do arquivo. Verifique sua conexão e tente novamente.',
          ),
        ),
      () => resolve(),
    );
  });
}
