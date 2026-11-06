import { RECURSOS, temRecurso } from '@no-strova/domain';
import { obterSessao } from '../../application/sessao.js';

/**
 * Frase para somar à mensagem de "configuração salva" quando o LTHR mudou: o intervals.icu usa o LTHR dele para converter as
 * faixas dos treinos em bpm, então precisa ficar igual. Só aparece para quem tem o envio ao Garmin liberado (vazia nos outros casos).
 * @param {number|null|undefined} antes LTHR anterior
 * @param {number|null|undefined} depois LTHR salvo agora
 */
export function avisoDeLthrNoIntervals(antes, depois) {
  if (antes === depois || !Number.isFinite(depois)) return '';
  if (!temRecurso(obterSessao().perfil, RECURSOS.GARMIN)) return '';
  return ' O LTHR mudou: se você envia treinos ao Garmin pelo intervals.icu, atualize o LTHR lá também. Em Plano → Enviar para o Garmin há um botão para isso.';
}
