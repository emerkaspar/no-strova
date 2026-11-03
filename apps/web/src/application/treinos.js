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

/**
 * Modelos próprios do usuário válidos, prontos para uso (com `origem: 'proprio'`). Os dados são escritos pelo cliente,
 * então são revalidados ao ler e os inválidos são ignorados.
 */
export function modelosProprios(lista) {
  const modelos = [];
  for (const doc of lista ?? []) {
    const r = validarTreinoEstruturado(doc);
    if (r.valido) modelos.push({ id: doc.id, ...r.valores, origem: 'proprio' });
  }
  return modelos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

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
