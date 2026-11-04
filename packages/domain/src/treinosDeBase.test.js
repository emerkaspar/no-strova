import { describe, expect, it } from 'vitest';
import { MINIMO_DA_RODAGEM_MIN, MINIMO_DO_LONGAO_MIN, TREINOS_DE_BASE, treinosDeBaseDisponiveis } from './treinosDeBase.js';
import { duracaoTotalS, validarPassos } from './treinosEstruturados.js';

describe('treinos de base', () => {
  it('cada construtor fecha a duração pedida (até 4 min a mais) e gera passos válidos', () => {
    for (const t of TREINOS_DE_BASE) {
      for (let d = t.minMin; d <= Math.min(t.maxMin, 180); d += 5) {
        const passos = t.passos(d);
        const minutos = duracaoTotalS(passos) / 60;
        expect(minutos, `${t.id} em ${d} min`).toBeGreaterThanOrEqual(d - 1);
        expect(minutos, `${t.id} em ${d} min`).toBeLessThanOrEqual(d + 4);
        expect(validarPassos(passos).valido, `${t.id} em ${d} min`).toBe(true);
      }
    }
  });

  it('os nomes são únicos', () => {
    const nomes = TREINOS_DE_BASE.map((t) => t.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('longão: 2 horas ou mais; rodagem: 45 min no pedal e 30 na corrida', () => {
    expect(MINIMO_DO_LONGAO_MIN).toEqual({ ciclismo: 120, corrida: 120 });
    expect(MINIMO_DA_RODAGEM_MIN).toEqual({ ciclismo: 45, corrida: 30 });
    expect(treinosDeBaseDisponiveis({ tipo: 'longao', duracaoMin: 90, esporte: 'ciclismo' })).toEqual([]);
    expect(treinosDeBaseDisponiveis({ tipo: 'longao', duracaoMin: 120, esporte: 'ciclismo' }).length).toBeGreaterThan(1);
    expect(treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: 30, esporte: 'ciclismo' })).toEqual([]);
    expect(treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: 45, esporte: 'ciclismo' }).length).toBeGreaterThan(3);
    expect(treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: 30, esporte: 'corrida' }).length).toBeGreaterThan(0);
  });

  it('semana de recuperação só tem rodagens bem leves, mais de uma opção', () => {
    const opcoes = treinosDeBaseDisponiveis({ tipo: 'leve', duracaoMin: 60, recuperacao: true, esporte: 'ciclismo' });
    expect(opcoes.length).toBeGreaterThanOrEqual(3);
    expect(opcoes.every((t) => t.recuperacao)).toBe(true);
  });
});
