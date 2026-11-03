import { describe, expect, it } from 'vitest';
import { lerDuracao, textoDeDuracao } from './duracao.js';

describe('lerDuracao', () => {
  it('entende segundos, minutos, min:s e horas', () => {
    expect(lerDuracao('30s')).toBe(30);
    expect(lerDuracao('30 s')).toBe(30);
    expect(lerDuracao('45 seg')).toBe(45);
    expect(lerDuracao('3')).toBe(180);
    expect(lerDuracao('3 min')).toBe(180);
    expect(lerDuracao('3m')).toBe(180);
    expect(lerDuracao('2,5')).toBe(150);
    expect(lerDuracao('1:30')).toBe(90);
    expect(lerDuracao('10:05')).toBe(605);
    expect(lerDuracao('1h')).toBe(3600);
    expect(lerDuracao('1,5 h')).toBe(5400);
  });

  it('texto vazio ou incompreensível: null', () => {
    expect(lerDuracao('')).toBeNull();
    expect(lerDuracao('   ')).toBeNull();
    expect(lerDuracao('abc')).toBeNull();
    expect(lerDuracao('3x')).toBeNull();
    expect(lerDuracao(null)).toBeNull();
  });
});

describe('textoDeDuracao', () => {
  it('formata de volta de um jeito que lerDuracao entende', () => {
    for (const s of [20, 30, 60, 150, 180, 605, 3600]) expect(lerDuracao(textoDeDuracao(s))).toBe(s);
    expect(textoDeDuracao(30)).toBe('30 s');
    expect(textoDeDuracao(180)).toBe('3 min');
    expect(textoDeDuracao(150)).toBe('2:30');
    expect(textoDeDuracao(NaN)).toBe('');
  });
});
