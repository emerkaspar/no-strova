import { describe, expect, it } from 'vitest';
import { fatorDeCargaPorFeedback, resumirFeedbacks, validarFeedback } from './feedback.js';

describe('validarFeedback', () => {
  it('aceita só a sensação', () => {
    const r = validarFeedback({ sensacao: 2 });
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ sensacao: 2, rpe: null, etiquetas: [], dor: null, notas: null });
  });

  it('exige a sensação entre 1 e 5', () => {
    expect(validarFeedback({}).valido).toBe(false);
    expect(validarFeedback({ sensacao: 6 }).valido).toBe(false);
    expect(validarFeedback({ sensacao: 2.5 }).valido).toBe(false);
  });

  it('valida RPE, etiquetas e limites de texto', () => {
    expect(validarFeedback({ sensacao: 3, rpe: 11 }).valido).toBe(false);
    expect(validarFeedback({ sensacao: 3, etiquetas: ['xyz'] }).valido).toBe(false);
    expect(validarFeedback({ sensacao: 3, notas: 'a'.repeat(501) }).valido).toBe(false);
    const r = validarFeedback({ sensacao: 3, rpe: '7', etiquetas: ['calor', 'calor', 'dor'], dor: '  joelho  direito ', notas: ' boa ' });
    expect(r.valores).toEqual({ sensacao: 3, rpe: 7, etiquetas: ['calor', 'dor'], dor: 'joelho direito', notas: 'boa' });
  });

  it('descarta o local da dor sem a etiqueta "dor"', () => {
    expect(validarFeedback({ sensacao: 3, dor: 'joelho' }).valores.dor).toBeNull();
  });
});

describe('resumirFeedbacks', () => {
  const hoje = '2026-11-05';
  const fb = (data, sensacao, extra = {}) => ({ data, feedback: { sensacao, ...extra } });

  it('devolve null sem registros na janela', () => {
    expect(resumirFeedbacks([], hoje)).toBeNull();
    expect(resumirFeedbacks([fb('2026-09-01', 3)], hoje)).toBeNull();
  });

  it('resume média, último difícil e dor recorrente', () => {
    const r = resumirFeedbacks(
      [fb('2026-11-04', 4, { etiquetas: ['dor'], dor: 'joelho' }), fb('2026-11-02', 5, { etiquetas: ['dor', 'calor'], dor: 'joelho', rpe: 9 }), fb('2026-10-30', 2, { etiquetas: ['calor'] })],
      hoje,
    );
    expect(r.registros).toBe(3);
    expect(r.sensacaoMedia).toBe(3.7);
    expect(r.ultimoDificil).toBe('2026-11-04');
    expect(r.dorRecorrente).toBe(true);
    expect(r.locaisDeDor).toEqual(['joelho']);
    expect(r.etiquetasFrequentes).toEqual(['calor']);
  });
});

describe('fatorDeCargaPorFeedback', () => {
  it('não ajusta com poucos registros', () => {
    expect(fatorDeCargaPorFeedback(null)).toBeNull();
    expect(fatorDeCargaPorFeedback({ registros: 1, sensacaoMedia: 5, rpeMedio: 9, dorRecorrente: true })).toBeNull();
  });

  it('reduz com dor ou sensação alta', () => {
    expect(fatorDeCargaPorFeedback({ registros: 3, sensacaoMedia: 2, rpeMedio: 5, dorRecorrente: true })).toBe(0.75);
    expect(fatorDeCargaPorFeedback({ registros: 3, sensacaoMedia: 4.2, rpeMedio: 6, dorRecorrente: false })).toBe(0.85);
    expect(fatorDeCargaPorFeedback({ registros: 3, sensacaoMedia: 2, rpeMedio: 5, dorRecorrente: false })).toBeNull();
  });
});
