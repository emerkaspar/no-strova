import { decidirRascunho, iaChamadasRestantes, sugerirTreinos, sugerirTreinoUnico } from '../core/functions.js';
import { adicionarVariosAoPlano } from './treinos.js';

/** Quantas sugestões de IA ainda restam hoje. */
export async function restantesDaIa() {
  const r = await iaChamadasRestantes();
  return r.restantes;
}

/** Pede à IA os treinos das próximas semanas. Retorna { rascunhoId, restantes, saida }. Lança Error em português. */
export function pedirTreinosDaIa(entrada) {
  return sugerirTreinos(entrada);
}

/** Pede à IA um único treino para o dia (pela carga e pelo sentimento recente). Retorna { rascunhoId, restantes, saida }. */
export function pedirTreinoUnicoDaIa({ data, duracaoMin = null, trajetoId = null, esporte = null }) {
  return sugerirTreinoUnico({ data, ...(duracaoMin ? { duracaoMin } : {}), ...(trajetoId ? { trajetoId } : {}), ...(esporte ? { esporte } : {}) });
}

/**
 * Aceita (parte d)a sugestão: grava os treinos escolhidos no plano pelo caminho de sempre (validação e regras) e só
 * depois marca o rascunho como aceito.
 * @param {{ uid: string, rascunhoId: string, itens: Array<{ modelo: any, data: string }>, configs: any[] }} p
 */
export async function aceitarTreinosDaIa({ uid, rascunhoId, itens, configs }) {
  if (itens.length === 0) throw new Error('Marque pelo menos um treino.');
  // um treino próprio sugerido pode ter sido excluído depois do pedido
  if (itens.some((i) => !i.modelo)) throw new Error('Um dos treinos sugeridos não existe mais entre os seus treinos. Peça uma nova sugestão.');
  await adicionarVariosAoPlano({ uid, itens, configs });
  await decidirRascunho({ rascunhoId, decisao: 'aceito' });
}

export function descartarRascunho(rascunhoId) {
  return decidirRascunho({ rascunhoId, decisao: 'descartado' });
}
