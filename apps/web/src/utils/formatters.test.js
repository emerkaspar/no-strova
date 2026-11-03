import { describe, expect, it } from 'vitest';
import { formatarDataHora } from './formatters.js';

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
