import { calcularImpacto, conquistasDoTreino, equivalenciasDeCalorias, recomendacaoDeRecuperacao } from '@no-strova/domain';
import { lerConsulta } from '../core/db.js';
import { hojeIso } from '../utils/formatters.js';

/**
 * Monta o resumo de impacto de uma atividade recém-salva.
 * Lê as atividades do usuário (e não o estresseDiario) porque o agregado do servidor é atualizado por trigger,
 * e pode ainda não refletir a atividade logo depois de salvar.
 *
 * @param {{ uid: string, atividade: object }} entrada atividade já com os campos salvos (título, esporte...)
 * @returns {Promise<{ impacto: object|null, equivalencias: object[], conquistas: object, recomendacao: object|null }>}
 */
export async function carregarImpacto({ uid, atividade }) {
  const todas = await lerConsulta('atividades', { onde: [['userId', '==', uid]], limite: 1000 });
  const outras = todas.filter((x) => x.id !== atividade.id);
  const impacto = calcularImpacto({ outrasAtividades: outras, atividade });
  return {
    impacto,
    equivalencias: equivalenciasDeCalorias(atividade.calorias),
    conquistas: conquistasDoTreino({ atividade, outrasAtividades: outras, hojeIso: hojeIso() }),
    recomendacao: impacto ? recomendacaoDeRecuperacao(impacto.forma.depois) : null,
  };
}
