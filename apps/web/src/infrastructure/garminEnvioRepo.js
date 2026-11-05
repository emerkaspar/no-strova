import { observarDocumento } from '../core/db.js';

/** Andamento do envio de treinos ao Garmin (só a Function escreve). Cancele o listener ao terminar. */
export function observarEnvioGarmin(uid, aoDados, aoErro) {
  return observarDocumento(`users/${uid}/garminEnvio/atual`, aoDados, aoErro);
}
