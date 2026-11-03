import { describe, expect, it } from 'vitest';
import { configVigenteEm, validarConfigAtleta } from './configAtleta.js';

const valida = {
  vigenteDesde: '2026-01-01',
  fcMax: 190,
  fcRepouso: 50,
  lthr: 170,
  sexo: 'masculino',
  pesoKg: 72.5,
  alturaCm: 178,
};

describe('validarConfigAtleta', () => {
  it('aceita uma configuração válida', () => {
    const r = validarConfigAtleta(valida);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual(valida);
  });

  it('aceita números digitados como texto, com vírgula decimal', () => {
    const r = validarConfigAtleta({ ...valida, fcMax: '190', pesoKg: '72,5', alturaCm: '178' });
    expect(r.valido).toBe(true);
    expect(r.valores.pesoKg).toBe(72.5);
  });

  it('exige repouso < LTHR <= máxima', () => {
    expect(validarConfigAtleta({ ...valida, fcRepouso: 190 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, lthr: 40 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, lthr: 195 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, lthr: 190 }).valido).toBe(true);
  });

  it('rejeita valores fora dos limites e campos ausentes', () => {
    expect(validarConfigAtleta({ ...valida, fcMax: 90 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, fcMax: 190.5 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, sexo: 'x' }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, pesoKg: 5 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, alturaCm: 400 }).valido).toBe(false);
    expect(validarConfigAtleta({ ...valida, vigenteDesde: '2026-02-30' }).valido).toBe(false);
    expect(validarConfigAtleta({}).valido).toBe(false);
    expect(validarConfigAtleta(null).valido).toBe(false);
  });
});

describe('configVigenteEm', () => {
  const configs = [
    { id: 'c1', vigenteDesde: '2025-01-01', fcMax: 188 },
    { id: 'c3', vigenteDesde: '2026-06-01', fcMax: 190 },
    { id: 'c2', vigenteDesde: '2025-09-15', fcMax: 189 },
  ];

  it('escolhe a de maior vigenteDesde que não passa da data', () => {
    expect(configVigenteEm(configs, '2025-01-01').id).toBe('c1');
    expect(configVigenteEm(configs, '2025-09-14').id).toBe('c1');
    expect(configVigenteEm(configs, '2025-09-15').id).toBe('c2');
    expect(configVigenteEm(configs, '2026-05-31').id).toBe('c2');
    expect(configVigenteEm(configs, '2030-01-01').id).toBe('c3');
  });

  it('retorna null antes da primeira vigência ou sem configurações', () => {
    expect(configVigenteEm(configs, '2024-12-31')).toBeNull();
    expect(configVigenteEm([], '2026-01-01')).toBeNull();
    expect(configVigenteEm(undefined, '2026-01-01')).toBeNull();
  });
});
