import { describe, expect, it } from 'vitest';
import { avaliarTesteLthr } from './lthr.js';
import { chaveDoTrajeto, validarNomeDoTrajeto } from './trajeto.js';

describe('validarNomeDoTrajeto', () => {
  it('limpa espaços e gera a chave', () => {
    const r = validarNomeDoTrajeto('  Volta  da Lagoa ');
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ nome: 'Volta da Lagoa', chave: 'volta da lagoa' });
  });

  it('recusa vazio, não texto e nome longo demais', () => {
    expect(validarNomeDoTrajeto('   ').valido).toBe(false);
    expect(validarNomeDoTrajeto(null).valido).toBe(false);
    expect(validarNomeDoTrajeto('a'.repeat(61)).valido).toBe(false);
  });

  it('a chave ignora acento e caixa', () => {
    expect(chaveDoTrajeto('Ciclovia São José')).toBe(chaveDoTrajeto('ciclovia  sao jose'));
  });
});

describe('avaliarTesteLthr', () => {
  it('aceita arquivo com FC e 30 minutos ou mais', () => {
    expect(avaliarTesteLthr({ origem: 'arquivo', fcMedia: 150, duracaoS: 1800 }).elegivel).toBe(true);
  });

  it('explica o motivo quando não serve', () => {
    expect(avaliarTesteLthr({ origem: 'manual', fcMedia: 150, duracaoS: 3600 }).elegivel).toBe(false);
    expect(avaliarTesteLthr({ origem: 'arquivo', fcMedia: null, duracaoS: 3600 }).motivo).toMatch(/frequência/);
    expect(avaliarTesteLthr({ origem: 'arquivo', fcMedia: 150, duracaoS: 1799 }).motivo).toMatch(/30 minutos/);
  });
});
