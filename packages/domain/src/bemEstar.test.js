import { describe, expect, it } from 'vitest';
import { formatarSono, resumoDeBemEstar } from './bemEstar.js';

const HOJE = '2026-11-17';

describe('resumoDeBemEstar', () => {
  it('pega o dado mais recente de cada métrica e a média de 7 dias', () => {
    const r = resumoDeBemEstar(
      [
        { data: '2026-11-17', passos: 8000, sonoSegundos: null },
        { data: '2026-11-16', passos: 6000, sonoSegundos: 7 * 3600 },
        { data: '2026-11-10', passos: 20000, sonoSegundos: 9 * 3600 }, // fora dos 7 dias
      ],
      HOJE,
    );
    expect(r.passos).toEqual({ data: '2026-11-17', valor: 8000 });
    expect(r.sono).toEqual({ data: '2026-11-16', segundos: 7 * 3600 });
    expect(r.mediaPassos7).toBe(7000);
    expect(r.mediaSono7S).toBe(7 * 3600);
  });

  it('ignora dias futuros e devolve null sem dados', () => {
    const r = resumoDeBemEstar([{ data: '2026-11-20', passos: 5000, sonoSegundos: 3600 }], HOJE);
    expect(r).toEqual({ passos: null, sono: null, mediaPassos7: null, mediaSono7S: null });
    expect(resumoDeBemEstar([], HOJE).passos).toBeNull();
  });
});

describe('formatarSono', () => {
  it('formata horas e minutos', () => {
    expect(formatarSono(7 * 3600 + 5 * 60)).toBe('7 h 05 min');
    expect(formatarSono(45 * 60)).toBe('45 min');
    expect(formatarSono(0)).toBe('—');
    expect(formatarSono(null)).toBe('—');
  });
});
