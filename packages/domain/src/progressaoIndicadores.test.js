import { describe, expect, it } from 'vitest';
import { avaliarObjetivo, indicadoresDoObjetivo, periodosRecentesDaMeta } from './progressao.js';

const HOJE = '2026-11-17';
const meta = (extra = {}) => ({ periodo: 'mes', inicio: '2026-11-01', tipo: 'distancia', valorAlvo: 400, esportes: [], ...extra });
const atividades = [{ id: 'a', data: '2026-11-10', esporte: 'ciclismo', distanciaM: 182000 }];

describe('indicadoresDoObjetivo', () => {
  it('no mês, mostra o ritmo necessário por semana e a projeção do fim do mês', () => {
    const m = meta();
    const r = indicadoresDoObjetivo(m, avaliarObjetivo({ meta: m, atividades, hoje: HOJE }));
    expect(r.unidade).toBe('semana');
    expect(r.ritmoNecessario).toBeCloseTo((218 / 13) * 7, 5);
    expect(r.projecaoFim).toBeCloseTo((182 / 17) * 30, 5);
  });

  it('na semana, o ritmo é por dia; no ano, por mês', () => {
    const s = meta({ periodo: 'semana', inicio: '2026-11-16', valorAlvo: 100 });
    expect(indicadoresDoObjetivo(s, avaliarObjetivo({ meta: s, atividades: [{ data: '2026-11-16', esporte: 'ciclismo', distanciaM: 34000 }], hoje: HOJE })).unidade).toBe('dia');
    const a = meta({ periodo: 'ano', inicio: '2026-01-01', valorAlvo: 5000 });
    const r = indicadoresDoObjetivo(a, avaliarObjetivo({ meta: a, atividades, hoje: HOJE }));
    expect(r.unidade).toBe('mês');
    expect(r.ritmoNecessario).toBeCloseTo(((5000 - 182) / (365 - 321)) * (365 / 12), 5);
  });

  it('é nulo quando o objetivo já foi atingido, não começou ou é de Condicionamento', () => {
    const m = meta({ valorAlvo: 100 });
    expect(indicadoresDoObjetivo(m, avaliarObjetivo({ meta: m, atividades, hoje: HOJE }))).toBeNull();
    const futuro = meta({ inicio: '2027-01-01', periodo: 'ano' });
    expect(indicadoresDoObjetivo(futuro, avaliarObjetivo({ meta: futuro, atividades, hoje: HOJE }))).toBeNull();
    const cond = meta({ tipo: 'condicionamento' });
    expect(indicadoresDoObjetivo(cond, avaliarObjetivo({ meta: cond, atividades, hoje: HOJE, condicionamentoPorData: new Map([['2026-11-17', 40]]) }))).toBeNull();
  });
});

describe('periodosRecentesDaMeta', () => {
  it('em meta semanal, traz as últimas 3 semanas, marcando atingida, não atingida e em andamento', () => {
    const m = meta({ periodo: 'semana', inicio: '2026-10-26', valorAlvo: 50 });
    const ativ = [
      { data: '2026-11-03', esporte: 'ciclismo', distanciaM: 60000 }, // semana de 02/11: atingida
      { data: '2026-11-10', esporte: 'ciclismo', distanciaM: 20000 }, // semana de 09/11: não atingida
      { data: '2026-11-16', esporte: 'ciclismo', distanciaM: 30000 }, // semana de 16/11: em andamento
    ];
    const r = periodosRecentesDaMeta({ meta: m, atividades: ativ, hoje: HOJE });
    expect(r.map((x) => x.estado)).toEqual(['atingido', 'nao-atingido', 'em-andamento']);
    expect(r.map((x) => x.atual)).toEqual([false, false, true]);
    expect(r[2].percentual).toBeCloseTo(60);
  });

  it('em meta mensal recente, completa com os meses anteriores à meta, marcados como "antes"', () => {
    const m = meta({ inicio: '2026-11-01' });
    const r = periodosRecentesDaMeta({ meta: m, atividades: [...atividades, { data: '2026-10-05', esporte: 'ciclismo', distanciaM: 450000 }], hoje: HOJE });
    expect(r.map((x) => x.periodo.rotulo)).toEqual(['set/2026', 'out/2026', 'nov/2026']);
    expect(r.map((x) => x.antes)).toEqual([true, true, false]);
    expect(r.map((x) => x.estado)).toEqual(['nao-atingido', 'atingido', 'em-andamento']);
  });

  it('em meta anual, compara os 3 últimos anos com o alvo da meta', () => {
    const m = meta({ periodo: 'ano', inicio: '2026-01-01', valorAlvo: 1000 });
    const ativ = [
      { data: '2024-05-01', esporte: 'ciclismo', distanciaM: 1200000 },
      { data: '2025-05-01', esporte: 'ciclismo', distanciaM: 400000 },
      { data: '2026-05-01', esporte: 'ciclismo', distanciaM: 600000 },
    ];
    const r = periodosRecentesDaMeta({ meta: m, atividades: ativ, hoje: HOJE });
    expect(r.map((x) => x.periodo.rotulo)).toEqual(['2024', '2025', '2026']);
    expect(r.map((x) => x.estado)).toEqual(['atingido', 'nao-atingido', 'em-andamento']);
    expect(r.map((x) => x.valor)).toEqual([1200, 400, 600]);
  });
});
