import { describe, expect, it } from 'vitest';
import { calcularSerieForma } from './forma.js';
import { calcularImpacto, conquistasDoTreino, equivalenciasDeCalorias, recomendacaoDeRecuperacao, textoDaQuantidade, EQUIVALENCIAS } from './impactoTreino.js';

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

describe('conquistasDoTreino', () => {
  const hist = [1, 2, 3, 4].map((i) => ({ id: `h${i}`, esporte: 'corrida', data: `2026-10-${String(i * 7).padStart(2, '0')}`, distanciaM: 5000 + i * 100, duracaoS: 1800, hrss: 50 }));
  const nova = { id: 'x', esporte: 'corrida', data: '2026-11-10', distanciaM: 9000, duracaoS: 3000, hrss: 120 };

  it('traz medalha de ouro de distância para o maior treino', () => {
    const r = conquistasDoTreino({ atividade: nova, outrasAtividades: hist, hojeIso: '2026-11-10' });
    const ouro = r.medalhas.find((m) => m.metrica === 'distancia');
    expect(ouro).toMatchObject({ tipo: 'podio', medalha: 'ouro' });
  });

  it('detecta novo pico de condicionamento e semana mais pesada', () => {
    const r = conquistasDoTreino({ atividade: nova, outrasAtividades: hist, hojeIso: '2026-11-10' });
    expect(r.marcos.map((m) => m.id)).toEqual(expect.arrayContaining(['pico-condicionamento', 'semana-mais-pesada']));
  });

  it('não repete a própria atividade e compara semana e mês', () => {
    const r = conquistasDoTreino({ atividade: nova, outrasAtividades: [...hist, nova], hojeIso: '2026-11-10' });
    expect(r.semana.atual.atividades).toBe(1);
    expect(r.mes.anterior.atividades).toBe(1); // 07/10, até o dia 10
    expect(r.nAno).toBe(5);
  });

  it('sem histórico não há medalha', () => {
    const r = conquistasDoTreino({ atividade: nova, outrasAtividades: [], hojeIso: '2026-11-10' });
    expect(r.medalhas).toEqual([]);
  });

  it('marco de km no ano', () => {
    const grande = { id: 'g', esporte: 'ciclismo', data: '2026-11-10', distanciaM: 60000 };
    const base = [{ id: 'a', esporte: 'ciclismo', data: '2026-03-01', distanciaM: 30000 }];
    const r = conquistasDoTreino({ atividade: grande, outrasAtividades: base, hojeIso: '2026-11-10' });
    expect(r.marcos.find((m) => m.id === 'km-no-ano')?.texto).toContain('50 km');
  });
});

describe('recomendacaoDeRecuperacao', () => {
  it('muda conforme a faixa', () => {
    expect(recomendacaoDeRecuperacao(-40).faixa.id).toBe('overload');
    expect(recomendacaoDeRecuperacao(10).faixa.id).toBe('freshness');
    expect(recomendacaoDeRecuperacao(-20).titulo).toBeTruthy();
  });
});
