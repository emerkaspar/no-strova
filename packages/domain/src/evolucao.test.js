import { describe, expect, it } from 'vitest';
import { comparativoDeEsforcos, comparativoNaFc, mediaMovelNosTreinos, velocidadeNaFc, vereditoDeEvolucao } from './evolucao.js';

const HOJE = '2026-11-16';
/** Ponto de treino comparável: 1 h, a `velocidadeKmh` e `fcMedia`. */
const ponto = (data, velocidadeKmh, fcMedia = 130) => ({ id: data, data, tempoS: 3600, velocidadeKmh, fcMedia });

describe('velocidadeNaFc', () => {
  it('leva a velocidade para a FC de referência', () => {
    expect(velocidadeNaFc(ponto('2026-11-01', 20, 140), 130)).toBeCloseTo(18.57, 2);
    expect(velocidadeNaFc(ponto('2026-11-01', 20, 120), 130)).toBeCloseTo(21.67, 2);
  });
});

describe('mediaMovelNosTreinos', () => {
  it('calcula a média só dos treinos dentro da janela, em cada dia de treino', () => {
    const pontos = [ponto('2026-09-01', 10), ponto('2026-09-10', 20), ponto('2026-11-01', 30)];
    const r = mediaMovelNosTreinos(pontos, (p) => p.velocidadeKmh, 28);
    expect(r.map((d) => d.valor)).toEqual([10, 15, 30]);
    expect(r[2].n).toBe(1);
  });
});

describe('comparativoNaFc', () => {
  it('é nulo com menos de 3 treinos para achar a FC de referência', () => {
    expect(comparativoNaFc([ponto('2026-11-01', 20), ponto('2026-10-01', 20)], { hoje: HOJE })).toBeNull();
  });

  it('compara a janela recente com a anterior, na mesma FC', () => {
    const pontos = [ponto('2026-08-20', 18), ponto('2026-09-10', 18), ponto('2026-10-20', 24), ponto('2026-11-05', 24)];
    const r = comparativoNaFc(pontos, { hoje: HOJE, dias: 60 });
    expect(r.fcRef).toBe(130);
    expect(r.recenteKmh).toBeCloseTo(24);
    expect(r.anteriorKmh).toBeCloseTo(18);
    expect(r.variacaoPct).toBeCloseTo(33.33, 1);
  });
});

describe('comparativoDeEsforcos', () => {
  const ativ = (data, melhor5kS) => ({ esporte: 'ciclismo', data, melhor5kS });

  it('compara o melhor tempo das duas janelas e marca o recorde', () => {
    const r = comparativoDeEsforcos([ativ('2026-06-01', 700), ativ('2026-08-01', 600), ativ('2026-11-01', 500)], 'ciclismo', { hoje: HOJE, dias: 90 });
    const cinco = r.find((e) => e.id === 'melhor5k');
    expect(cinco.recente.tempoS).toBe(500);
    expect(cinco.anterior.tempoS).toBe(600);
    expect(cinco.variacaoPct).toBeCloseTo(20);
    expect(cinco.recorde).toBe(true);
  });

  it('não marca recorde quando o melhor de todos os tempos é antigo', () => {
    const r = comparativoDeEsforcos([ativ('2026-03-01', 400), ativ('2026-08-01', 600), ativ('2026-11-01', 500)], 'ciclismo', { hoje: HOJE, dias: 90 });
    expect(r.find((e) => e.id === 'melhor5k').recorde).toBe(false);
  });

  it('ignora esforços sem nenhum dado e atividades de outro esporte', () => {
    expect(comparativoDeEsforcos([{ esporte: 'corrida', data: '2026-11-01', melhor5kS: 1200 }], 'ciclismo', { hoje: HOJE })).toEqual([]);
  });
});

describe('vereditoDeEvolucao', () => {
  const naFc = (variacaoPct) => ({ variacaoPct });
  const esforco = (variacaoPct, rotulo = '20 km', recorde = false) => ({ variacaoPct, rotulo, recorde });

  it('diz que está evoluindo quando os sinais sobem, citando recorde e sequência', () => {
    const v = vereditoDeEvolucao({ naFc: naFc(33.2), esforcos: [esforco(5, '20 km', true)], sequenciaSemanas: 5 });
    expect(v.id).toBe('melhorou');
    expect(v.texto).toBe('+33,2% de velocidade na mesma FC; novo melhor de 20 km; 5 semanas seguidas treinando.');
    expect(v.destaque).toBeCloseTo(33.2);
  });

  it('sinaliza queda com o lembrete de contexto', () => {
    const v = vereditoDeEvolucao({ naFc: naFc(-6), esforcos: [] });
    expect(v.id).toBe('piorou');
    expect(v.texto).toContain('−6% de velocidade na mesma FC');
    expect(v.texto).toContain('Calor');
  });

  it('é misto quando um sinal sobe e outro cai', () => {
    expect(vereditoDeEvolucao({ naFc: naFc(8), esforcos: [esforco(-4)] }).id).toBe('misto');
  });

  it('é estável dentro de ±2% e sem dados sem nenhum sinal', () => {
    expect(vereditoDeEvolucao({ naFc: naFc(1), esforcos: [] }).id).toBe('estavel');
    expect(vereditoDeEvolucao({ naFc: null, esforcos: [] }).id).toBe('sem-dados');
  });

  it('usa "ritmo" na corrida', () => {
    expect(vereditoDeEvolucao({ naFc: naFc(5), esporte: 'corrida' }).texto).toContain('de ritmo na mesma FC');
  });
});
