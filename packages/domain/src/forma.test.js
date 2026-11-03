import { describe, expect, it } from 'vitest';
import {
  calcularSerieForma,
  diasEntre,
  FAIXAS_FORMA,
  faixaDaForma,
  recortarSerie,
  somarDias,
} from './forma.js';

const K42 = 1 - Math.exp(-1 / 42);
const K7 = 1 - Math.exp(-1 / 7);

describe('datas', () => {
  it('soma e diferença de dias, inclusive na virada de mês e ano bissexto', () => {
    expect(somarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(somarDias('2024-02-28', 1)).toBe('2024-02-29');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(diasEntre('2026-01-01', '2026-03-01')).toBe(59);
    expect(diasEntre('2026-03-01', '2026-01-01')).toBe(-59);
  });
});

describe('faixaDaForma', () => {
  it('segue as zonas do Elevate (limites exclusivos por baixo)', () => {
    expect(faixaDaForma(40).id).toBe('transicao');
    expect(faixaDaForma(25.01).id).toBe('transicao');
    expect(faixaDaForma(25).id).toBe('freshness');
    expect(faixaDaForma(5.01).id).toBe('freshness');
    expect(faixaDaForma(5).id).toBe('neutral');
    expect(faixaDaForma(0).id).toBe('neutral');
    expect(faixaDaForma(-10).id).toBe('optimal');
    expect(faixaDaForma(-30).id).toBe('overload');
    expect(faixaDaForma(-80).id).toBe('overload');
    expect(FAIXAS_FORMA.map((f) => f.id)).toEqual(['transicao', 'freshness', 'neutral', 'optimal', 'overload']);
  });
});

describe('calcularSerieForma', () => {
  it('começa um dia antes da primeira atividade, com tudo em zero', () => {
    const serie = calcularSerieForma([{ data: '2026-11-01', estresse: 100 }]);
    expect(serie[0]).toMatchObject({ data: '2026-10-31', estresse: 0, fitness: 0, fadiga: 0, forma: 0 });
    expect(serie[1].data).toBe('2026-11-01');
  });

  it('aplica a média móvel exponencial de 42 e de 7 dias', () => {
    const serie = calcularSerieForma([{ data: '2026-11-01', estresse: 100 }], { ate: '2026-11-03' });
    expect(serie[1].fitness).toBeCloseTo(100 * K42, 10);
    expect(serie[1].fadiga).toBeCloseTo(100 * K7, 10);
    // segundo dia, sem treino: decai
    expect(serie[2].fitness).toBeCloseTo(100 * K42 * (1 - K42), 10);
    expect(serie[2].fadiga).toBeCloseTo(100 * K7 * (1 - K7), 10);
  });

  it('a Forma de hoje usa Fitness e Fadiga de ontem', () => {
    const serie = calcularSerieForma([{ data: '2026-11-01', estresse: 100 }], { ate: '2026-11-03' });
    expect(serie[1].forma).toBe(0); // dia do treino: ontem era tudo zero
    expect(serie[2].forma).toBeCloseTo(serie[1].fitness - serie[1].fadiga, 10);
    expect(serie[2].forma).toBeLessThan(-10); // 2,35 − 13,31 ≈ −10,96
    expect(serie[2].faixa).toBe('optimal');
  });

  it('com estresse constante, Fitness e Fadiga convergem para ele e a Forma para zero', () => {
    const dias = Array.from({ length: 400 }, (_, i) => ({ data: somarDias('2025-01-01', i), estresse: 100 }));
    const ultimo = calcularSerieForma(dias).at(-1);
    expect(ultimo.fitness).toBeCloseTo(100, 0);
    expect(ultimo.fadiga).toBeCloseTo(100, 3);
    expect(Math.abs(ultimo.forma)).toBeLessThan(0.5);
  });

  it('preenche os dias sem treino com estresse zero', () => {
    const serie = calcularSerieForma([
      { data: '2026-11-01', estresse: 80 },
      { data: '2026-11-05', estresse: 60 },
    ]);
    expect(serie.map((d) => d.data)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(serie[3].estresse).toBe(0);
    expect(serie[5].estresse).toBe(60);
  });

  it('soma vários treinos do mesmo dia e aceita entrada fora de ordem', () => {
    const serie = calcularSerieForma([
      { data: '2026-11-02', estresse: 30 },
      { data: '2026-11-01', estresse: 50 },
      { data: '2026-11-01', estresse: 20 },
    ]);
    expect(serie.find((d) => d.data === '2026-11-01').estresse).toBe(70);
    expect(serie[0].data).toBe('2026-10-31');
  });

  it('estende até uma data futura com decaimento, sem passar para trás do último treino', () => {
    const base = [{ data: '2026-11-01', estresse: 100 }];
    const estendida = calcularSerieForma(base, { ate: '2026-12-31' });
    expect(estendida.at(-1).data).toBe('2026-12-31');
    expect(estendida.at(-1).fitness).toBeLessThan(estendida[1].fitness);
    expect(calcularSerieForma(base, { ate: '2026-10-01' }).at(-1).data).toBe('2026-11-01');
  });

  it('ignora estresse inválido ou não positivo e devolve vazio sem treinos', () => {
    expect(calcularSerieForma([])).toEqual([]);
    expect(calcularSerieForma(undefined)).toEqual([]);
    expect(calcularSerieForma([{ data: '2026-11-01', estresse: 0 }, { data: '2026-11-02', estresse: null }, { data: '2026-11-03', estresse: Number.NaN }])).toEqual([]);
  });

  it('a Forma fica alta depois de uma pausa longa (zona de transição)', () => {
    const treino = Array.from({ length: 60 }, (_, i) => ({ data: somarDias('2026-01-01', i), estresse: 90 }));
    const serie = calcularSerieForma(treino, { ate: somarDias('2026-03-02', 14) });
    expect(serie.at(-1).forma).toBeGreaterThan(5);
  });
});

describe('recortarSerie', () => {
  const serie = Array.from({ length: 100 }, (_, i) => ({ data: somarDias('2026-01-01', i) }));
  it('devolve os últimos N dias, ou tudo quando N é nulo ou maior que a série', () => {
    expect(recortarSerie(serie, 30)).toHaveLength(30);
    expect(recortarSerie(serie, 30).at(-1).data).toBe(serie.at(-1).data);
    expect(recortarSerie(serie, null)).toHaveLength(100);
    expect(recortarSerie(serie, 365)).toHaveLength(100);
  });
});
