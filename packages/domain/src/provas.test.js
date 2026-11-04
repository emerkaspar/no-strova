import { describe, expect, it } from 'vitest';
import { formatarTempoDaProva, lerTempoDaProva, provaDoPlano, provasFuturas, validarProva } from './provas.js';

const HOJE = '2026-11-04';
const base = { nome: 'Meia de Porto Alegre', data: '2027-03-14', esporte: 'corrida', prioridade: 'A' };

describe('lerTempoDaProva / formatarTempoDaProva', () => {
  it('lê h:mm:ss e mm:ss', () => {
    expect(lerTempoDaProva('1:45:30')).toBe(6330);
    expect(lerTempoDaProva('45:00')).toBe(2700);
  });

  it('recusa formatos inválidos', () => {
    expect(lerTempoDaProva('abc')).toBeNull();
    expect(lerTempoDaProva('1:75:00')).toBeNull();
    expect(lerTempoDaProva('90')).toBeNull();
    expect(lerTempoDaProva('')).toBeNull();
  });

  it('formata de volta', () => {
    expect(formatarTempoDaProva(6330)).toBe('1:45:30');
    expect(formatarTempoDaProva(2700)).toBe('45:00');
  });
});

describe('validarProva', () => {
  it('aceita só os campos obrigatórios e zera os opcionais', () => {
    const r = validarProva(base, HOJE);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ ...base, distanciaKm: null, metaTempoS: null, local: null, formaAlvo: null });
  });

  it('normaliza os campos opcionais', () => {
    const r = validarProva({ ...base, distanciaKm: '21,0975', metaTempo: '1:45:00', local: ' Porto Alegre ', formaAlvo: '12,34' }, HOJE);
    expect(r.valido).toBe(true);
    expect(r.valores).toMatchObject({ distanciaKm: 21.1, metaTempoS: 6300, local: 'Porto Alegre', formaAlvo: 12.3 });
  });

  it('recusa nome curto, data passada, prioridade e esporte inválidos', () => {
    expect(validarProva({ ...base, nome: 'ab' }, HOJE).valido).toBe(false);
    expect(validarProva({ ...base, data: '2026-11-03' }, HOJE).erros).toContain('A data da prova não pode estar no passado.');
    expect(validarProva({ ...base, prioridade: 'D' }, HOJE).valido).toBe(false);
    expect(validarProva({ ...base, esporte: 'natacao' }, HOJE).valido).toBe(false);
  });

  it('aceita a prova de hoje e recusa além de 2 anos', () => {
    expect(validarProva({ ...base, data: HOJE }, HOJE).valido).toBe(true);
    expect(validarProva({ ...base, data: '2029-01-01' }, HOJE).valido).toBe(false);
  });

  it('recusa distância, tempo e Forma-alvo fora da faixa', () => {
    expect(validarProva({ ...base, distanciaKm: '0' }, HOJE).valido).toBe(false);
    expect(validarProva({ ...base, metaTempo: 'rápido' }, HOJE).valido).toBe(false);
    expect(validarProva({ ...base, formaAlvo: '99' }, HOJE).valido).toBe(false);
  });
});

describe('provaDoPlano', () => {
  const provas = [
    { id: 'c', data: '2026-12-01', prioridade: 'C' },
    { id: 'b', data: '2026-12-10', prioridade: 'B' },
    { id: 'a2', data: '2027-06-01', prioridade: 'A' },
    { id: 'a1', data: '2027-03-01', prioridade: 'A' },
    { id: 'passada', data: '2026-10-01', prioridade: 'A' },
  ];

  it('escolhe a prova A mais próxima, ignorando as passadas', () => {
    expect(provaDoPlano(provas, HOJE).id).toBe('a1');
  });

  it('sem A, cai para B e depois C', () => {
    expect(provaDoPlano(provas.filter((p) => p.prioridade !== 'A'), HOJE).id).toBe('b');
    expect(provaDoPlano([provas[0]], HOJE).id).toBe('c');
    expect(provaDoPlano([], HOJE)).toBeNull();
  });

  it('lista as futuras em ordem de data', () => {
    expect(provasFuturas(provas, HOJE).map((p) => p.id)).toEqual(['c', 'b', 'a1', 'a2']);
  });
});
