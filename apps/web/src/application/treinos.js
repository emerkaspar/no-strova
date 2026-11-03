import {
  configVigenteEm,
  estimarEstresseEstruturado,
  treinoPlanejadoDoModelo,
  validarTreinoEstruturado,
  validarTreinoPlanejado,
} from '@no-strova/domain';
import { atualizarModelo, criarModelo, excluirModelo } from '../infrastructure/modelosRepo.js';
import { salvarPreferencias } from '../infrastructure/calibracaoRepo.js';
import { criarTreino, criarTreinosEmLote } from '../infrastructure/planoRepo.js';

export { modelosProprios } from './modelos.js';

function preparar(modelo, data, configs) {
  const r = validarTreinoPlanejado(treinoPlanejadoDoModelo(modelo, data));
  if (!r.valido) throw new Error(r.erros.join(' '));
  const estimado = estimarEstresseEstruturado({ passos: r.valores.passos, config: configVigenteEm(configs, data) });
  return { valores: r.valores, estimado };
}

/** Adiciona um treino do catálogo ou próprio ao plano, na data. Lança Error em português. Retorna o id. */
export function adicionarModeloAoPlano({ uid, modelo, data, configs }) {
  const { valores, estimado } = preparar(modelo, data, configs);
  return criarTreino(uid, valores, estimado);
}

/** Adiciona vários de uma vez (tudo ou nada). `itens`: [{ modelo, data }]. */
export function adicionarVariosAoPlano({ uid, itens, configs }) {
  return criarTreinosEmLote(
    uid,
    itens.map(({ modelo, data }) => preparar(modelo, data, configs)),
  );
}

/** Valida e salva um modelo próprio (novo ou editado). Lança Error em português. */
export async function salvarModeloProprio({ uid, id, entrada }) {
  const r = validarTreinoEstruturado(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  if (id) {
    await atualizarModelo(id, r.valores);
    return id;
  }
  return criarModelo(uid, r.valores);
}

export const excluirModeloProprio = excluirModelo;

export function salvarNivelDosTreinos(uid, nivel) {
  return salvarPreferencias(uid, { nivelTreinos: nivel });
}
