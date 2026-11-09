import { describe, expect, it } from 'vitest';
import { DURACAO_MINIMA_ALVO_FC_S, etapaTemAlvoDeFc, expandirPassos, validarTreinoEstruturado } from './treinosEstruturados.js';

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

describe('validarTreinoEstruturado: tag do trajeto', () => {
  const base = { nome: 'Limiar na orla', esporte: 'corrida', foco: 'limiar', nivel: 'intermediario', passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z4' }] };

  it('sem trajeto, os valores não trazem a tag', () => {
    const r = validarTreinoEstruturado(base);
    expect(r.valido).toBe(true);
    expect(r.valores).not.toHaveProperty('trajetoId');
    expect(r.valores).not.toHaveProperty('trajetoNome');
  });

  it('com trajeto, guarda o id e o nome', () => {
    const r = validarTreinoEstruturado({ ...base, trajetoId: ' abc123 ', trajetoNome: ' Orla ' });
    expect(r.valido).toBe(true);
    expect(r.valores).toMatchObject({ trajetoId: 'abc123', trajetoNome: 'Orla' });
  });

  it('o nome do trajeto é limitado e o id não pode ter barra', () => {
    expect(validarTreinoEstruturado({ ...base, trajetoId: 'a/b', trajetoNome: 'x' }).valido).toBe(false);
    const longo = validarTreinoEstruturado({ ...base, trajetoId: 'abc', trajetoNome: 'x'.repeat(200) });
    expect(longo.valores.trajetoNome).toHaveLength(60);
  });
});
