import { ehRecorrente, periodoDe, somarDias, validarMetaDeProgressao } from '@no-strova/domain';
import { criarMetaProgressao, encerrarMetaProgressao } from '../infrastructure/metasProgressaoRepo.js';

const mesmosEsportes = (a, b) => a.length === b.length && a.every((e) => b.includes(e));

/**
 * Valida e cria a meta. Metas de semana e de mês são recorrentes: valem a partir do período atual para todos os
 * seguintes, até o usuário trocar o valor ou encerrar. Criar uma meta do mesmo tipo e esportes substitui a vigente: a
 * anterior passa a valer só até o período anterior (ou some, se tinha começado neste mesmo período). As badges já
 * conquistadas ficam. Devolve o id; lança Error com a mensagem em português quando inválida.
 */
export async function salvarMetaDeProgressao({ uid, entrada, metas = [], hoje }) {
  const r = validarMetaDeProgressao(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  // Condicionamento vem do HRSS de todos os esportes: o filtro de esporte não se aplica
  const valores = r.valores.tipo === 'condicionamento' ? { ...r.valores, esportes: [] } : r.valores;

  const ajustes = [];
  for (const m of metas) {
    if (m.periodo !== valores.periodo || m.tipo !== valores.tipo || !mesmosEsportes(m.esportes ?? [], valores.esportes)) continue;
    if (ehRecorrente(valores)) {
      if (m.ate && m.ate < valores.inicio) continue; // já encerrada antes
      ajustes.push(m.inicio >= valores.inicio ? { id: m.id, apagar: true } : { id: m.id, ate: somarDias(valores.inicio, -1) });
    } else if (m.inicio === valores.inicio) {
      ajustes.push({ id: m.id, apagar: true });
    }
  }
  return criarMetaProgressao(uid, valores, ajustes);
}

/** Encerra a meta recorrente ao fim do período atual: os seguintes deixam de ter esse objetivo. */
export function encerrarMetaDeProgressao({ meta, hoje }) {
  return encerrarMetaProgressao(meta.id, periodoDe(meta.periodo, hoje).fim);
}
