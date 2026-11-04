import { describe, expect, it } from 'vitest';
import { estimarFcMax, estimarLthr, situacaoDoPerfilDeTreino, validarRotina } from './onboarding.js';

const HOJE = new Date('2026-11-04T12:00:00Z');

describe('estimarFcMax', () => {
  it('usa Tanaka (208 − 0,7 × idade)', () => {
    expect(estimarFcMax('1986-11-04', HOJE)).toBe(180); // 40 anos
    expect(estimarFcMax('1996-01-01', HOJE)).toBe(187); // 30 anos
  });

  it('devolve null sem data válida', () => {
    expect(estimarFcMax('', HOJE)).toBeNull();
    expect(estimarFcMax(null, HOJE)).toBeNull();
    expect(estimarFcMax('2020-02-31', HOJE)).toBeNull();
  });
});

describe('estimarLthr', () => {
  it('é 90% da FC máxima', () => {
    expect(estimarLthr(190)).toBe(171);
  });

  it('não passa da FC de repouso nem aceita FC máxima inválida', () => {
    expect(estimarLthr(190, 175)).toBeNull();
    expect(estimarLthr(50)).toBeNull();
    expect(estimarLthr(Number.NaN)).toBeNull();
  });
});

describe('validarRotina', () => {
  const base = { diasTreino: [5, 1, 3, 1], diaLongao: 5, horasSemana: '6,5', esportePrincipal: 'ciclismo' };

  it('normaliza dias (únicos e ordenados) e horas', () => {
    const r = validarRotina(base);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ diasTreino: [1, 3, 5], diaLongao: 5, horasSemana: 6.5, esportePrincipal: 'ciclismo' });
  });

  it('aceita sem longão e assume os dois esportes', () => {
    const r = validarRotina({ diasTreino: [0], diaLongao: null, horasSemana: 3 });
    expect(r.valido).toBe(true);
    expect(r.valores.diaLongao).toBeNull();
    expect(r.valores.esportePrincipal).toBe('ambos');
  });

  it('recusa longão fora dos dias de treino, sem dias e horas fora da faixa', () => {
    expect(validarRotina({ ...base, diaLongao: 6 }).valido).toBe(false);
    expect(validarRotina({ ...base, diasTreino: [] }).valido).toBe(false);
    expect(validarRotina({ ...base, horasSemana: 0 }).valido).toBe(false);
    expect(validarRotina({ ...base, horasSemana: 26 }).valido).toBe(false);
    expect(validarRotina({ ...base, esportePrincipal: 'natacao' }).valido).toBe(false);
  });
});

describe('situacaoDoPerfilDeTreino', () => {
  it('novo: nunca viu o wizard e não tem configuração', () => {
    expect(situacaoDoPerfilDeTreino({ preferencias: null, configs: [] })).toBe('novo');
  });

  it('pulado: fechou sem concluir e ainda sem configuração', () => {
    expect(situacaoDoPerfilDeTreino({ preferencias: { onboarding: 'pulado' }, configs: [] })).toBe('pulado');
  });

  it('ok: concluiu, ou já tem configuração (mesmo tendo pulado)', () => {
    expect(situacaoDoPerfilDeTreino({ preferencias: { onboarding: 'concluido' }, configs: [] })).toBe('ok');
    expect(situacaoDoPerfilDeTreino({ preferencias: { onboarding: 'pulado' }, configs: [{ id: 'x' }] })).toBe('ok');
    expect(situacaoDoPerfilDeTreino({ preferencias: null, configs: [{ id: 'x' }] })).toBe('ok');
  });
});
