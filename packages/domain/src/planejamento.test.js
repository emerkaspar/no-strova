import { describe, expect, it } from 'vitest';
import { estressesParaProjecao, ritmoSemanalPorDia, serieComProjecao, treinosFuturos } from './planejamento.js';

const HOJE = '2026-11-04';
const t = (id, data, status = 'planejado') => ({ id, data, status });

describe('treinosFuturos', () => {
  it('só os planejados de amanhã em diante', () => {
    const lista = [
      t('ontem', '2026-11-03'),
      t('hoje', HOJE),
      t('amanha', '2026-11-05'),
      t('longe', '2027-03-01'),
      t('feito', '2026-11-10', 'realizado'),
      t('pulado', '2026-11-11', 'pulado'),
    ];
    expect(treinosFuturos(lista, HOJE).map((x) => x.id)).toEqual(['amanha', 'longe']);
  });

  it('lista vazia ou ausente', () => {
    expect(treinosFuturos([], HOJE)).toEqual([]);
    expect(treinosFuturos(undefined, HOJE)).toEqual([]);
  });
});

describe('ritmo médio na projeção', () => {
  // 4 semanas de treino antes de HOJE (qua 2026-11-04): 100 de estresse toda segunda e 50 todo sábado
  const realizado = [{ data: '2026-08-01', estresse: 10 }]; // antiga: fora da janela de 8 semanas
  for (let s = 1; s <= 4; s++) {
    const seg = new Date(Date.UTC(2026, 10, 4 - 7 * s - 2)); // segunda de cada semana anterior
    realizado.push({ data: seg.toISOString().slice(0, 10), estresse: 100 });
    realizado.push({ data: new Date(seg.getTime() + 5 * 86400000).toISOString().slice(0, 10), estresse: 50 });
  }

  it('média por dia da semana nas semanas completas', () => {
    const ritmo = ritmoSemanalPorDia({ realizado, hoje: HOJE });
    expect(ritmo[1]).toBe(50); // 4 segundas de 100 em 8 semanas
    expect(ritmo[6]).toBe(25);
    expect(ritmo[3]).toBe(0);
  });

  it('sem histórico suficiente (menos de 2 semanas) não há ritmo', () => {
    expect(ritmoSemanalPorDia({ realizado: [], hoje: HOJE })).toBeNull();
    expect(ritmoSemanalPorDia({ realizado: [{ data: '2026-11-01', estresse: 80 }], hoje: HOJE })).toBeNull();
  });

  it('dias futuros sem treino usam o ritmo; o treino previsto substitui a média', () => {
    const ritmo = ritmoSemanalPorDia({ realizado, hoje: HOJE });
    const treinos = [{ id: 'a', data: '2026-11-09', status: 'planejado', estresseManual: 30 }]; // segunda
    const r = estressesParaProjecao({ realizado: [], treinos, configs: [], hoje: HOJE, ritmo, ate: '2026-11-16' });
    expect(r.find((e) => e.data === '2026-11-09')).toMatchObject({ estresse: 30, origem: 'planejado' });
    expect(r.find((e) => e.data === '2026-11-16')).toMatchObject({ estresse: 50, origem: 'ritmo' });
    expect(r.find((e) => e.data === '2026-11-07')).toMatchObject({ estresse: 25, origem: 'ritmo' });
  });

  it('a série não decai a zero depois do último treino planejado', () => {
    const ritmo = ritmoSemanalPorDia({ realizado, hoje: HOJE });
    const ate = '2026-12-31';
    const com = serieComProjecao({ realizado, treinos: [], configs: [], hoje: HOJE, ate, ritmo });
    const sem = serieComProjecao({ realizado, treinos: [], configs: [], hoje: HOJE, ate });
    expect(com.at(-1).fitness).toBeGreaterThan(sem.at(-1).fitness + 5);
    expect(com.at(-1).origem).toBeDefined();
  });
});
