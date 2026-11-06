import { describe, expect, it } from 'vitest';
import { potenciaDoInstante, potenciaPorAmostra, resumirPotencia, VERSAO_DA_POTENCIA } from './potenciaEstimada.js';

/** Trecho de `n` segundos a velocidade constante, com inclinação constante. */
function trecho(n, velMs, grade = 0) {
  return Array.from({ length: n + 1 }, (_, t) => ({ t, vel: velMs, dist: t * velMs, alt: 100 + t * velMs * grade }));
}

describe('potenciaDoInstante', () => {
  it('plano a 30 km/h com 80 kg + bike fica na faixa de 150 a 220 W', () => {
    const w = potenciaDoInstante({ velMs: 30 / 3.6, grade: 0, aceleracaoMs2: 0, massaKg: 89 });
    expect(w).toBeGreaterThan(150);
    expect(w).toBeLessThan(220);
  });

  it('subida de 8% a 10 km/h com 80 kg + bike fica perto de 250 W', () => {
    const w = potenciaDoInstante({ velMs: 10 / 3.6, grade: 0.08, aceleracaoMs2: 0, massaKg: 89 });
    expect(w).toBeGreaterThan(200);
    expect(w).toBeLessThan(300);
  });

  it('descida sem pedalar vira zero e parado vale zero', () => {
    expect(potenciaDoInstante({ velMs: 12, grade: -0.08, aceleracaoMs2: 0, massaKg: 89 })).toBe(0);
    expect(potenciaDoInstante({ velMs: 0, grade: 0, aceleracaoMs2: 0, massaKg: 89 })).toBe(0);
  });

  it('dados inválidos valem zero', () => {
    expect(potenciaDoInstante({ velMs: Number.NaN, grade: 0, aceleracaoMs2: 0, massaKg: 89 })).toBe(0);
  });
});

describe('potenciaPorAmostra', () => {
  it('em velocidade constante no plano, é estável e igual à fórmula', () => {
    const am = trecho(120, 30 / 3.6);
    const serie = potenciaPorAmostra(am, { pesoKg: 80 });
    const esperado = potenciaDoInstante({ velMs: 30 / 3.6, grade: 0, aceleracaoMs2: 0, massaKg: 89 });
    expect(serie[60]).toBeCloseTo(esperado, 0);
    expect(serie[0]).toBeNull();
  });

  it('sem peso, não estima', () => {
    expect(potenciaPorAmostra(trecho(30, 8), { pesoKg: 0 })).toEqual([]);
  });
});

describe('resumirPotencia', () => {
  it('estima no ciclismo com peso e identifica a origem', () => {
    const r = resumirPotencia(trecho(600, 30 / 3.6), 'ciclismo', { pesoKg: 80 });
    expect(r.potenciaOrigem).toBe('estimada');
    expect(r.potenciaMediaW).toBeGreaterThan(150);
    expect(r.potenciaNormalizadaW).toBeGreaterThanOrEqual(r.potenciaMediaW - 1);
    expect(r.potenciaMax5minW).not.toBeNull();
    expect(r.potenciaMax20minW).toBeNull();
  });

  it('prefere a potência medida do arquivo', () => {
    const am = trecho(120, 8).map((a) => ({ ...a, pot: 200 }));
    const r = resumirPotencia(am, 'ciclismo', { pesoKg: 80 });
    expect(r.potenciaOrigem).toBe('medida');
    expect(r.potenciaMediaW).toBe(200);
    expect(r.potenciaMax1minW).toBe(200);
  });

  it('não vale para corrida nem sem peso', () => {
    expect(resumirPotencia(trecho(120, 3), 'corrida', { pesoKg: 70 }).potenciaOrigem).toBeNull();
    expect(resumirPotencia(trecho(120, 8), 'ciclismo', {}).potenciaOrigem).toBeNull();
  });

  it('expõe a versão do cálculo', () => {
    expect(VERSAO_DA_POTENCIA).toBe(1);
  });
});
