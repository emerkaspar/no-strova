import { describe, expect, it } from 'vitest';
import { faixaPercentualDaZona } from './treinosEstruturados.js';
import { duracaoIntervals, textoDoTreinoIntervals } from './textoIntervals.js';

describe('duracaoIntervals', () => {
  it('formata minutos, segundos e os dois juntos', () => {
    expect(duracaoIntervals(600)).toBe('10m');
    expect(duracaoIntervals(90)).toBe('1m30s');
    expect(duracaoIntervals(45)).toBe('45s');
  });
});

describe('faixaPercentualDaZona', () => {
  it('traz as fronteiras das zonas em % do LTHR', () => {
    expect(faixaPercentualDaZona('Z2')).toEqual([80, 89]);
    expect(faixaPercentualDaZona('Z4')).toEqual([94.5, 100]);
    expect(faixaPercentualDaZona('Z9')).toBeNull();
  });
});

describe('textoDoTreinoIntervals', () => {
  it('uma linha por passo, com alvo em % do LTHR e o nome do passo', () => {
    const texto = textoDoTreinoIntervals([
      { papel: 'aquecimento', duracaoS: 600, zona: 'Z2', descricao: 'Aquecimento progressivo' },
      { papel: 'principal', duracaoS: 300, zona: 'Z4', descricao: null },
      { papel: 'recuperacao', duracaoS: 90, zona: 'Z1', descricao: null },
    ]);
    expect(texto).toBe('- 10m 80-89% LTHR Aquecimento progressivo\n- 5m 94.5-100% LTHR Esforço\n- 1m30s 60-80% LTHR Recuperação');
  });

  it('passo de alvo aberto sai sem alvo de FC', () => {
    expect(textoDoTreinoIntervals([{ papel: 'principal', duracaoS: 600, zona: 'Z4', alvoAberto: true }])).toBe('- 10m Esforço');
  });
});
