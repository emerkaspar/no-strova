import { describe, expect, it } from 'vitest';
import { horizonteDaProjecao } from './planejamento.js';
import {
  avaliarMetaCondicionamento,
  progressoDaMetaCondicionamento,
  RITMO_MAXIMO_SEMANAL,
  TOLERANCIA_META_CONDICIONAMENTO,
  validarMetaCondicionamento,
} from './metaCondicionamento.js';

const HOJE = '2026-11-04';

describe('validarMetaCondicionamento', () => {
  it('aceita número com vírgula e uma data de hoje até 365 dias', () => {
    const r = validarMetaCondicionamento({ condicionamentoAlvo: '42,55', dataAlvo: '2026-12-20' }, HOJE);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ condicionamentoAlvo: 42.6, dataAlvo: '2026-12-20' });
  });

  it('recusa alvo vazio ou fora de 1 a 250, e datas passadas, inválidas ou além de 365 dias', () => {
    expect(validarMetaCondicionamento({ condicionamentoAlvo: '', dataAlvo: '2026-12-20' }, HOJE).valido).toBe(false);
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 0, dataAlvo: '2026-12-20' }, HOJE).valido).toBe(false);
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 251, dataAlvo: '2026-12-20' }, HOJE).valido).toBe(false);
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 40, dataAlvo: '2026-11-03' }, HOJE).erros.join(' ')).toContain('passado');
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 40, dataAlvo: '2028-01-01' }, HOJE).erros.join(' ')).toContain('365');
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 40, dataAlvo: 'x' }, HOJE).valido).toBe(false);
  });

  it('aceita a meta para hoje', () => {
    expect(validarMetaCondicionamento({ condicionamentoAlvo: 40, dataAlvo: HOJE }, HOJE).valido).toBe(true);
  });
});

describe('avaliarMetaCondicionamento', () => {
  // Condicionamento 30 hoje (04/11) e 44 em 18/11
  const serie = [
    { data: '2026-11-04', fitness: 30 },
    { data: '2026-11-11', fitness: 37 },
    { data: '2026-11-18', fitness: 44 },
  ];

  it('sem meta: null', () => {
    expect(avaliarMetaCondicionamento(serie, null, HOJE)).toBeNull();
  });

  it('dentro de ±3 pontos: atinge; menos: abaixo; mais: acima', () => {
    const meta = (alvo) => ({ condicionamentoAlvo: alvo, dataAlvo: '2026-11-18' });
    expect(avaliarMetaCondicionamento(serie, meta(46), HOJE).estado).toBe('atinge');
    expect(avaliarMetaCondicionamento(serie, meta(47), HOJE).estado).toBe('atinge'); // exatamente 3
    expect(avaliarMetaCondicionamento(serie, meta(48), HOJE).estado).toBe('abaixo');
    expect(avaliarMetaCondicionamento(serie, meta(40), HOJE).estado).toBe('acima');
    expect(TOLERANCIA_META_CONDICIONAMENTO).toBe(3);
  });

  it('o ritmo (pontos por semana) necessário e o do plano, de hoje até a data da meta', () => {
    const a = avaliarMetaCondicionamento(serie, { condicionamentoAlvo: 51, dataAlvo: '2026-11-18' }, HOJE);
    expect(a.dias).toBe(14);
    expect(a.condicionamentoAtual).toBe(30);
    expect(a.condicionamentoProjetado).toBe(44);
    expect(a.ritmoNecessario).toBeCloseTo(10.5, 5); // 21 pontos em 2 semanas
    expect(a.ritmoDoPlano).toBeCloseTo(7, 5); // 14 pontos em 2 semanas
    expect(a.agressiva).toBe(true); // 10,5 > 7
    expect(RITMO_MAXIMO_SEMANAL).toBe(7);
  });

  it('ritmo sustentável não é agressivo (exatamente 7 por semana também não)', () => {
    expect(avaliarMetaCondicionamento(serie, { condicionamentoAlvo: 44, dataAlvo: '2026-11-18' }, HOJE).agressiva).toBe(false);
  });

  it('data da meta fora da série: sem-dados; meta para hoje: sem ritmo', () => {
    const fora = avaliarMetaCondicionamento(serie, { condicionamentoAlvo: 40, dataAlvo: '2026-12-30' }, HOJE);
    expect(fora.estado).toBe('sem-dados');
    expect(fora.condicionamentoProjetado).toBeNull();
    const hoje = avaliarMetaCondicionamento(serie, { condicionamentoAlvo: 31, dataAlvo: HOJE }, HOJE);
    expect(hoje.estado).toBe('atinge');
    expect(hoje.ritmoNecessario).toBeNull();
  });
});

describe('progressoDaMetaCondicionamento', () => {
  it('fração do alvo já alcançada (atual ÷ alvo), limitada a 0–1', () => {
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: 3.1, condicionamentoAlvo: 30 })).toBeCloseTo(0.1033, 3);
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: 20, condicionamentoAlvo: 40 })).toBe(0.5);
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: 50, condicionamentoAlvo: 40 })).toBe(1);
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: -2, condicionamentoAlvo: 40 })).toBe(0);
  });

  it('sem Condicionamento atual: null', () => {
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: null, condicionamentoAlvo: 40 })).toBeNull();
    expect(progressoDaMetaCondicionamento({ condicionamentoAtual: undefined, condicionamentoAlvo: 40 })).toBeNull();
  });
});

describe('horizonte com meta de Condicionamento', () => {
  it('a meta de Condicionamento também estende a série até ela', () => {
    const treino = { status: 'planejado', data: '2026-11-06' };
    const metaCond = { ativa: true, dataAlvo: '2026-12-10' };
    expect(horizonteDaProjecao({ treinos: [treino], meta: null, metaCondicionamento: metaCond, hoje: HOJE })).toBe('2026-12-24'); // meta + 14
    expect(horizonteDaProjecao({ treinos: [treino], meta: null, metaCondicionamento: { ativa: false, dataAlvo: '2026-12-10' }, hoje: HOJE })).toBe('2026-11-20');
  });
});
