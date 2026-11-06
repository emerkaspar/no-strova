import { describe, expect, it } from 'vitest';
import { DURACAO_MINIMA_ALVO_FC_S, etapaTemAlvoDeFc, expandirPassos } from './treinosEstruturados.js';

describe('etapaTemAlvoDeFc', () => {
  it('passo com 1 min ou mais tem alvo de FC; menos que isso, não', () => {
    expect(DURACAO_MINIMA_ALVO_FC_S).toBe(60);
    expect(etapaTemAlvoDeFc({ duracaoS: 60, zona: 'Z4' })).toBe(true);
    expect(etapaTemAlvoDeFc({ duracaoS: 59, zona: 'Z5' })).toBe(false);
    expect(etapaTemAlvoDeFc({ duracaoS: 30, zona: 'Z5' })).toBe(false);
  });

  it('alvoAberto continua tirando o alvo de um passo longo', () => {
    expect(etapaTemAlvoDeFc({ duracaoS: 600, zona: 'Z5', alvoAberto: true })).toBe(false);
  });
});

describe('expandirPassos e o alvo de FC dos passos curtos', () => {
  it('marca como sem alvo o esforço e a recuperação curtos de uma série, mesmo em treinos já salvos', () => {
    const passos = [
      { tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z4' },
      { tipo: 'serie', repeticoes: 3, esforco: { duracaoS: 30, zona: 'Z5' }, recuperacao: { duracaoS: 90, zona: 'Z1' } },
    ];
    const blocos = expandirPassos(passos);
    expect(blocos.map((b) => b.alvoAberto)).toEqual([false, true, false, true, false, true]);
  });
});
