import { describe, expect, it } from 'vitest';
import { calcularSerieForma } from './forma.js';
import { calcularImpacto, destaquesDoTreino, equivalenciasDeCalorias, recomendacaoDeRecuperacao, textoDaQuantidade, EQUIVALENCIAS } from './impactoTreino.js';

describe('calcularImpacto', () => {
  it('sem hrss não há impacto', () => {
    expect(calcularImpacto({ atividade: { data: '2026-11-10', hrss: null } })).toBeNull();
  });

  it('primeiro treino: antes é zero e depois bate com a série', () => {
    const r = calcularImpacto({ atividade: { data: '2026-11-10', hrss: 100 } });
    const dia = calcularSerieForma([{ data: '2026-11-10', estresse: 100 }]).find((d) => d.data === '2026-11-10');
    expect(r.fitness.antes).toBe(0);
    expect(r.fitness.depois).toBeCloseTo(dia.fitness, 1);
    expect(r.fadiga.depois).toBeGreaterThan(r.fitness.depois); // fadiga sobe mais rápido
    expect(r.forma.depois).toBeLessThan(0);
  });

  it('com histórico: o treino sobe condicionamento e fadiga e derruba a forma de amanhã', () => {
    const outras = [
      { data: '2026-11-05', hrss: 60 },
      { data: '2026-11-07', hrss: 80 },
    ];
    const r = calcularImpacto({ outrasAtividades: outras, atividade: { data: '2026-11-10', hrss: 90 } });
    expect(r.fitness.delta).toBeGreaterThan(0);
    expect(r.fadiga.delta).toBeGreaterThan(r.fitness.delta);
    expect(r.forma.delta).toBeLessThan(0);
    expect(r.faixaDepois.id).toBeTruthy();
  });
});

describe('equivalenciasDeCalorias', () => {
  const fixo = () => 0;
  it('vazio sem calorias', () => {
    expect(equivalenciasDeCalorias(null)).toEqual([]);
    expect(equivalenciasDeCalorias(0)).toEqual([]);
  });
  it('sorteia itens distintos e é determinístico com sorteio fixo', () => {
    const r = equivalenciasDeCalorias(600, { sorteio: fixo });
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.id)).size).toBe(3);
    expect(equivalenciasDeCalorias(600, { sorteio: fixo })).toEqual(r);
    expect(r[0].frase).not.toContain('{n}');
  });
  it('poucas calorias usam só itens pequenos', () => {
    const r = equivalenciasDeCalorias(70, { sorteio: fixo });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x.quantidade).toBeGreaterThan(0);
  });
});

describe('textoDaQuantidade', () => {
  const cerveja = EQUIVALENCIAS.find((e) => e.id === 'cerveja');
  it('concorda singular, plural e meio', () => {
    expect(textoDaQuantidade(1.1, cerveja)).toBe('1 cerveja');
    expect(textoDaQuantidade(2.6, cerveja)).toBe('2,5 cervejas');
    expect(textoDaQuantidade(0.4, cerveja)).toBe('meia cerveja');
    expect(textoDaQuantidade(12.4, cerveja)).toBe('12 cervejas');
  });
});

describe('destaquesDoTreino', () => {
  const hist = [1, 2, 3, 4].map((i) => ({ id: `h${i}`, esporte: 'corrida', data: `2026-10-0${i}`, distanciaM: 5000 + i * 100, duracaoS: 1800, hrss: 50 }));
  it('sem histórico suficiente não há selos', () => {
    expect(destaquesDoTreino({ id: 'x', esporte: 'corrida', data: '2026-11-10', distanciaM: 9000 }, hist.slice(0, 2))).toEqual([]);
  });
  it('recorde de distância', () => {
    const s = destaquesDoTreino({ id: 'x', esporte: 'corrida', data: '2026-11-10', distanciaM: 9000, duracaoS: 1000, hrss: 10 }, hist);
    expect(s.map((x) => x.id)).toEqual(['distanciaM-recorde']);
  });
  it('ignora a própria atividade e outros esportes', () => {
    const a = { id: 'x', esporte: 'corrida', data: '2026-11-10', distanciaM: 9000 };
    expect(destaquesDoTreino(a, [...hist, a, { id: 'c', esporte: 'ciclismo', data: '2026-11-01', distanciaM: 90000 }]).length).toBe(1);
  });
});

describe('recomendacaoDeRecuperacao', () => {
  it('muda conforme a faixa', () => {
    expect(recomendacaoDeRecuperacao(-40).faixa.id).toBe('overload');
    expect(recomendacaoDeRecuperacao(10).faixa.id).toBe('freshness');
    expect(recomendacaoDeRecuperacao(-20).titulo).toBeTruthy();
  });
});
