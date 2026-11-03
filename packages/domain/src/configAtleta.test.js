import { describe, expect, it } from 'vitest';
import { atividadesAntesDaPrimeiraVigencia, configVigenteEm, primeiraVigencia, validarConfigAtleta } from './configAtleta.js';

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

describe('cobertura das vigências', () => {
  it('acha a primeira vigência', () => {
    expect(primeiraVigencia(['2026-11-03', '2025-01-01', '2026-06-01'])).toBe('2025-01-01');
    expect(primeiraVigencia([])).toBeNull();
    expect(primeiraVigencia(undefined)).toBeNull();
  });

  it('conta as atividades anteriores à primeira vigência (ficam sem HRSS)', () => {
    const datas = ['2026-10-15', '2026-10-19', '2026-11-03', '2026-12-01'];
    expect(atividadesAntesDaPrimeiraVigencia(['2026-11-03'], datas)).toBe(2);
    expect(atividadesAntesDaPrimeiraVigencia(['2026-10-15'], datas)).toBe(0);
    expect(atividadesAntesDaPrimeiraVigencia(['2026-12-01', '2026-10-19'], datas)).toBe(1);
  });

  it('sem nenhuma vigência, todas as atividades ficam sem configuração', () => {
    expect(atividadesAntesDaPrimeiraVigencia([], ['2026-10-15', '2026-10-19'])).toBe(2);
    expect(atividadesAntesDaPrimeiraVigencia([], [])).toBe(0);
  });
});
