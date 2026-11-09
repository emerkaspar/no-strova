import { validarMedidas } from '@no-strova/domain';
import { gravarMedidas } from '../infrastructure/medidasRepo.js';

/** Valida e grava as medidas do dia. Lança Error com a mensagem em português. */
export async function salvarMedidas({ uid, entrada, hoje }) {
  const r = validarMedidas(entrada, hoje);
  if (!r.valido) throw new Error(r.erros.join(' '));
  await gravarMedidas(uid, r.valores);
}
