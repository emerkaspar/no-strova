import { ehRecorrente, periodoDe, somarDias, validarMetaDeProgressao } from '@no-strova/domain';
import { atualizarMetaProgressao, criarMetaProgressao, encerrarMetaProgressao } from '../infrastructure/metasProgressaoRepo.js';

const mesmosEsportes = (a, b) => a.length === b.length && a.every((e) => b.includes(e));

/**
 * Valida e cria a meta. Metas de semana e de mês são recorrentes: valem a partir do período atual para todos os
 * seguintes, até o usuário trocar o valor ou encerrar. Criar uma meta do mesmo tipo e esportes substitui a vigente: a
 * anterior passa a valer só até o período anterior (ou some, se tinha começado neste mesmo período). As badges já
 * conquistadas ficam. Devolve o id; lança Error com a mensagem em português quando inválida.
 */
export async function salvarMetaDeProgressao({ uid, entrada, metas = [], hoje, ajustesExtras = [] }) {
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
  for (const extra of ajustesExtras) if (!ajustes.some((a) => a.id === extra.id)) ajustes.push(extra);
  return criarMetaProgressao(uid, valores, ajustes);
}

/**
 * Edita o valor da meta. Meta anual, ou recorrente que começou no período atual: corrige no próprio registro.
 * Recorrente de períodos anteriores: abre uma nova vigência a partir de agora, e o histórico (e as badges) ficam com o valor antigo.
 */
export async function editarMeta({ uid, meta, metas, valorAlvo, tipo, esportes, hoje }) {
  const entrada = { periodo: meta.periodo, inicio: meta.inicio, tipo, valorAlvo, esportes };
  const r = validarMetaDeProgressao(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  const { valorAlvo: alvo, tipo: tipoFinal } = r.valores;
  const esportesFinal = tipoFinal === 'condicionamento' ? [] : r.valores.esportes;
  if (!ehRecorrente(meta) || meta.inicio >= periodoDe(meta.periodo, hoje).inicio) {
    await atualizarMetaProgressao(meta.id, { valorAlvo: alvo, tipo: tipoFinal, esportes: esportesFinal });
    return meta.id;
  }
  // nova vigência: se o tipo/esporte mudou, a meta antiga não seria substituída sozinha, então encerra ela aqui
  const encerrarAntiga = !meta.ate || meta.ate >= periodoDe(meta.periodo, hoje).inicio ? [{ id: meta.id, ate: somarDias(periodoDe(meta.periodo, hoje).inicio, -1) }] : [];
  return salvarMetaDeProgressao({ uid, metas, hoje, entrada: { ...entrada, esportes: esportesFinal, inicio: hoje }, ajustesExtras: encerrarAntiga });
}

/** Encerra a meta recorrente ao fim do período atual: os seguintes deixam de ter esse objetivo. */
export function encerrarMetaDeProgressao({ meta, hoje }) {
  return encerrarMetaProgressao(meta.id, periodoDe(meta.periodo, hoje).fim);
}
