import { decidirRascunho, iaChamadasRestantes, sugerirMetaPeso, sugerirTreinos } from '../core/functions.js';
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

/**
 * Aceita (parte d)a sugestão: grava os treinos escolhidos no plano pelo caminho de sempre (validação e regras) e só
 * depois marca o rascunho como aceito.
 * @param {{ uid: string, rascunhoId: string, itens: Array<{ modelo: any, data: string }>, configs: any[] }} p
 */
export async function aceitarTreinosDaIa({ uid, rascunhoId, itens, configs }) {
  if (itens.length === 0) throw new Error('Marque pelo menos um treino.');
  await adicionarVariosAoPlano({ uid, itens, configs });
  await decidirRascunho({ rascunhoId, decisao: 'aceito' });
}

export function descartarRascunho(rascunhoId) {
  return decidirRascunho({ rascunhoId, decisao: 'descartado' });
}

/** Pede à IA o plano para uma meta de peso: { pesoAlvoKg, dataAlvo }. Retorna { rascunhoId, restantes, saida }. */
export function pedirPlanoDePesoDaIa(entrada) {
  return sugerirMetaPeso(entrada);
}

/** Marca o rascunho do plano de peso como aceito (a meta em si é gravada por quem chama, pelo caminho de sempre). */
export function marcarPlanoDePesoAceito(rascunhoId) {
  return decidirRascunho({ rascunhoId, decisao: 'aceito' });
}
