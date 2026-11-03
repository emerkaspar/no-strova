import { describe, expect, it } from 'vitest';
import {
  formatarData,
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  formatarNumero,
} from './formatters.js';

describe('formatarDataHora', () => {
  it('formata em pt-BR no fuso de São Paulo (UTC−3)', () => {
    const texto = formatarDataHora(Date.UTC(2026, 10, 3, 15, 30));
    expect(texto).toContain('03/11/2026');
    expect(texto).toContain('12:30');
  });

  it('usa traço quando não há valor', () => {
    expect(formatarDataHora(null)).toBe('—');
    expect(formatarDataHora(undefined)).toBe('—');
  });
});

describe('formatarData', () => {
  it('converte yyyy-mm-dd para dd/mm/aaaa sem deslocar o dia', () => {
    expect(formatarData('2026-11-03')).toBe('03/11/2026');
    expect(formatarData('2026-01-01')).toBe('01/01/2026');
  });

  it('usa traço para valores inválidos', () => {
    expect(formatarData(undefined)).toBe('—');
    expect(formatarData('03/11/2026')).toBe('—');
  });
});

describe('formatarNumero', () => {
  it('usa vírgula decimal e separador de milhar', () => {
    expect(formatarNumero(1234.5, 1)).toBe('1.234,5');
    expect(formatarNumero(42)).toBe('42');
    expect(formatarNumero(null)).toBe('—');
    expect(formatarNumero(Number.NaN)).toBe('—');
  });
});

describe('formatarDuracao', () => {
  it('mostra horas e minutos, ou minutos e segundos', () => {
    expect(formatarDuracao(3900)).toBe('1h 05min');
    expect(formatarDuracao(7475)).toBe('2h 04min');
    expect(formatarDuracao(2530)).toBe('42min 10s');
    expect(formatarDuracao(null)).toBe('—');
  });
});

describe('formatarDistancia', () => {
  it('converte metros em km com uma casa', () => {
    expect(formatarDistancia(42221)).toBe('42,2 km');
    expect(formatarDistancia(0)).toBe('0,0 km');
    expect(formatarDistancia(null)).toBe('—');
  });
});
