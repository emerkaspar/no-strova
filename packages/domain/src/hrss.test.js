import { describe, expect, it } from 'vitest';
import {
  arredondarHrss,
  calcularHrss,
  estimarHrssPorZona,
  fcMediaDaZona,
  hrssPorHora,
  reservaFc,
  trimp,
  ZONAS,
} from './hrss.js';

const masc = { fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino' };
const fem = { ...masc, sexo: 'feminino' };

describe('reservaFc', () => {
  it('calcula a fração da reserva e nunca fica negativa', () => {
    expect(reservaFc(120, 190, 50)).toBeCloseTo(0.5, 10);
    expect(reservaFc(40, 190, 50)).toBe(0);
  });
});

describe('trimp', () => {
  it('segue a fórmula de Banister do Elevate (homens)', () => {
    // 60 min a 50% da reserva: 60 (minutos) × 0,5 × 0,64 × e^(1,92 × 0,5)
    expect(trimp(3600, 50, 'masculino')).toBeCloseTo(60 * 0.5 * 0.64 * Math.exp(0.96), 10);
  });

  it('usa k = 1,67 para mulheres', () => {
    expect(trimp(3600, 50, 'feminino')).toBeCloseTo(60 * 0.5 * 0.64 * Math.exp(0.835), 10);
  });
});

describe('calcularHrss', () => {
  it('uma hora na FC do limiar vale 100 pontos', () => {
    expect(calcularHrss({ fcMedia: 170, tempoMovimentoS: 3600, config: masc })).toBeCloseTo(100, 1);
    expect(calcularHrss({ fcMedia: 170, tempoMovimentoS: 3600, config: fem })).toBeCloseTo(100, 1);
  });

  it('valor de referência: FC média 150, 1 h, FCmáx 190, repouso 50, LTHR 170 (homem)', () => {
    // Conta à mão: HRR = 71,429% → TRIMP = 60 × 0,71429 × 0,64 × e^(1,92 × 0,71429) = 108,06
    // LTHR: 60 × 0,85714 × 0,64 × e^(1,92 × 0,85714) = 170,64 → HRSS = 108,06 / 170,64 × 100 = 63,3
    expect(calcularHrss({ fcMedia: 150, tempoMovimentoS: 3600, config: masc })).toBeCloseTo(63.3, 0);
  });

  it('cresce com a duração e com a intensidade', () => {
    const base = calcularHrss({ fcMedia: 140, tempoMovimentoS: 1800, config: masc });
    expect(calcularHrss({ fcMedia: 140, tempoMovimentoS: 3600, config: masc })).toBeCloseTo(base * 2, 5);
    expect(calcularHrss({ fcMedia: 160, tempoMovimentoS: 1800, config: masc })).toBeGreaterThan(base);
  });

  it('retorna null quando falta dado ou a FC média está abaixo do repouso', () => {
    expect(calcularHrss({ fcMedia: null, tempoMovimentoS: 3600, config: masc })).toBeNull();
    expect(calcularHrss({ fcMedia: 150, tempoMovimentoS: 0, config: masc })).toBeNull();
    expect(calcularHrss({ fcMedia: 150, tempoMovimentoS: 3600, config: null })).toBeNull();
    expect(calcularHrss({ fcMedia: 45, tempoMovimentoS: 3600, config: masc })).toBeNull();
    expect(calcularHrss({ fcMedia: 150, tempoMovimentoS: 3600, config: { ...masc, fcMax: 50 } })).toBeNull();
  });
});

describe('zonas (Friel)', () => {
  it('converte a zona em FC média a partir do LTHR, limitada à FC máxima', () => {
    expect(fcMediaDaZona('Z2', masc)).toBe(Math.round(170 * 0.85));
    expect(fcMediaDaZona('Z5', { ...masc, lthr: 189 })).toBe(190);
    expect(fcMediaDaZona('Z9', masc)).toBeNull();
    expect(Object.keys(ZONAS)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
  });

  it('estima o HRSS pela zona: Z4 por 1 h fica próximo de 100', () => {
    const z4 = estimarHrssPorZona({ zona: 'Z4', duracaoS: 3600, config: masc });
    const z2 = estimarHrssPorZona({ zona: 'Z2', duracaoS: 3600, config: masc });
    expect(z4).toBeGreaterThan(85);
    expect(z4).toBeLessThan(105);
    expect(z2).toBeLessThan(z4);
    expect(estimarHrssPorZona({ zona: 'Z4', duracaoS: 3600, config: null })).toBeNull();
  });
});

describe('utilitários', () => {
  it('hrssPorHora e arredondamento', () => {
    expect(hrssPorHora(100, 3600)).toBe(100);
    expect(hrssPorHora(50, 1800)).toBe(100);
    expect(hrssPorHora(null, 1800)).toBeNull();
    expect(arredondarHrss(66.6666)).toBe(66.67);
    expect(arredondarHrss(null)).toBeNull();
  });
});
