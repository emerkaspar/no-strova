import { resumoDePeso, validarMetaPeso, validarPesagem } from '@no-strova/domain';
import { definirMetaPeso, gravarPesagem } from '../infrastructure/pesoRepo.js';

/** Valida e grava a pesagem do dia. Lança Error com a mensagem em português. */
export async function salvarPesagem({ uid, entrada, hoje }) {
  const r = validarPesagem(entrada, hoje);
  if (!r.valido) throw new Error(r.erros.join(' '));
  await gravarPesagem(uid, r.valores);
}

/**
 * Valida e define a meta de peso (a anterior vira "anterior"). Guarda o peso de hoje como ponto de partida, para medir
 * o progresso. Retorna os avisos (ex.: ritmo agressivo); lança Error com a mensagem em português quando inválida.
 */
export async function salvarMetaDePeso({ uid, entrada, hoje, metasAtivas, pesagens, alturaCm }) {
  const pesoAtualKg = resumoDePeso(pesagens, hoje).atual?.pesoKg ?? null;
  const r = validarMetaPeso(entrada, { pesoAtualKg, alturaCm }, hoje);
  if (!r.valido) throw new Error(r.erros.join(' '));
  await definirMetaPeso(uid, pesoAtualKg === null ? r.valores : { ...r.valores, pesoInicialKg: pesoAtualKg }, metasAtivas);
  return r.avisos;
}
