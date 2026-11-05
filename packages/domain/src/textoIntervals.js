import { faixaPercentualDaZona } from './treinosEstruturados.js';

/**
 * Treino no texto do intervals.icu (workout builder): uma linha por passo, "- 10m 80-89% LTHR Aquecimento". O alvo de FC vai
 * em % do LTHR, as mesmas faixas das zonas do app, então bate com a configuração de FC se o LTHR do intervals.icu for o mesmo.
 * Função pura.
 */

const ROTULO_PAPEL = { aquecimento: 'Aquecimento', principal: 'Esforço', recuperacao: 'Recuperação', desaquecimento: 'Volta à calma' };

/** 600 → "10m", 90 → "1m30s", 45 → "45s". */
export function duracaoIntervals(segundos) {
  const total = Math.max(1, Math.round(segundos));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}

/**
 * @param {{ papel: string, duracaoS: number, zona: string, descricao?: string|null, alvoAberto?: boolean }[]} blocos passos já expandidos
 * @returns {string}
 */
export function textoDoTreinoIntervals(blocos) {
  return blocos
    .map((b) => {
      const faixa = b.alvoAberto ? null : faixaPercentualDaZona(b.zona);
      const alvo = faixa ? ` ${faixa[0]}-${faixa[1]}% LTHR` : '';
      const nome = b.descricao || ROTULO_PAPEL[b.papel] || 'Esforço';
      return `- ${duracaoIntervals(b.duracaoS)}${alvo} ${nome}`;
    })
    .join('\n');
}
