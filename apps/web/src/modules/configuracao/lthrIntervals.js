import { RECURSOS, temRecurso } from '@no-strova/domain';
import { obterSessao } from '../../application/sessao.js';
import { intervalsAtualizarLthr, intervalsLthr, intervalsSituacao } from '../../core/functions.js';
import { confirmar } from '../../utils/modal.js';

const ROTULO_ESPORTE_LTHR = Object.freeze({ ciclismo: 'Ciclismo', corrida: 'Corrida' });

/** Esportes em que o LTHR do intervals.icu existe e é diferente do No Strova. */
export function esportesComLthrDiferente(s) {
  if (!Number.isFinite(s?.nostrova)) return [];
  return Object.keys(ROTULO_ESPORTE_LTHR).filter((e) => Number.isFinite(s[e]) && s[e] !== s.nostrova);
}

/** "Ciclismo: 150 bpm · Corrida: 160 bpm" (o LTHR do intervals.icu nos esportes que diferem). */
export const detalheDoLthrDiferente = (s) => esportesComLthrDiferente(s).map((e) => `${ROTULO_ESPORTE_LTHR[e]}: ${s[e]} bpm`).join(' · ');

/**
 * Pergunta (com confirmação) se o LTHR do No Strova deve ser gravado no intervals.icu e, se sim, grava só nos esportes que
 * diferem. Devolve a situação nova ou null se o usuário desistiu. As zonas de FC do intervals.icu não são recalculadas.
 * @param {{ nostrova: number, ciclismo: number|null, corrida: number|null }} s
 */
export async function confirmarEAtualizarLthr(s) {
  const esportes = esportesComLthrDiferente(s);
  if (esportes.length === 0) return s;
  const ok = await confirmar({
    titulo: 'Atualizar o LTHR no intervals.icu?',
    mensagem: [
      ...esportes.map((e) => `${ROTULO_ESPORTE_LTHR[e]}: ${s[e]} → ${s.nostrova} bpm`),
      '',
      'As zonas de FC que você ajustou no intervals.icu não são recalculadas. Os treinos enviados usam % do LTHR, então já refletem o novo valor.',
    ].join('\n'),
    confirmarTexto: 'Atualizar',
    tipo: 'info',
    icone: 'configuracao',
  });
  return ok ? intervalsAtualizarLthr({ esportes }) : null;
}

/**
 * Chamada logo depois de salvar a configuração de FC no No Strova: para quem usa o envio ao Garmin (intervals.icu conectado),
 * compara o LTHR em vigor hoje com o de lá e, se forem diferentes, oferece atualizar o intervals.icu na hora. Não depende de o
 * valor salvo agora ter mudado: uma vigência antiga ou futura não altera o LTHR de hoje, e o que importa é o que está valendo.
 * Devolve uma frase para somar à mensagem de "salvo" (vazia quando não se aplica). Nunca lança: falhas viram um aviso para o
 * usuário conferir em Plano → Enviar para o Garmin.
 */
export async function conferirLthrNoIntervals() {
  if (!temRecurso(obterSessao().perfil, RECURSOS.GARMIN)) return '';
  try {
    if (!(await intervalsSituacao()).conectado) return '';
    const s = await intervalsLthr();
    if (esportesComLthrDiferente(s).length === 0) return '';
    if (await confirmarEAtualizarLthr(s)) return ' LTHR atualizado também no intervals.icu.';
    return ' O LTHR do intervals.icu continua diferente do seu: atualize em Plano → Enviar para o Garmin.';
  } catch (err) {
    return ` Não consegui conferir o LTHR no intervals.icu (${err?.message || 'erro desconhecido'}). Confira em Plano → Enviar para o Garmin.`;
  }
}
