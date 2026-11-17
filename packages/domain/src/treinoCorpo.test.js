import { describe, expect, it } from 'vitest';
import { agruparTreinoECorpo, granularidadeDoPeriodo } from './treinoCorpo.js';

const HOJE = '2026-11-17'; // terça-feira

describe('granularidadeDoPeriodo', () => {
  it('agrupa por dia até 90 dias, por semana até 200 e por mês acima', () => {
    expect(granularidadeDoPeriodo(30)).toBe('dia');
    expect(granularidadeDoPeriodo(90)).toBe('dia');
    expect(granularidadeDoPeriodo(91)).toBe('semana');
    expect(granularidadeDoPeriodo(180)).toBe('semana');
    expect(granularidadeDoPeriodo(365)).toBe('mes');
    expect(granularidadeDoPeriodo(null, 120)).toBe('semana');
    expect(granularidadeDoPeriodo(null, 900)).toBe('mes');
  });
});

describe('agruparTreinoECorpo', () => {
  it('agrupa por semana com médias e soma da carga', () => {
    const r = agruparTreinoECorpo(
      {
        pesagens: [{ data: '2026-11-16', pesoKg: 90 }, { data: '2026-11-10', pesoKg: 92 }, { data: '2026-11-11', pesoKg: 91 }],
        bemEstar: [{ data: '2026-11-17', passos: 6000, sonoSegundos: 7 * 3600 }, { data: '2026-11-16', passos: 8000, sonoSegundos: null }],
        estresse: [{ data: '2026-11-16', estresse: 50 }, { data: '2026-11-17', estresse: 30 }, { data: '2026-11-10', estresse: 20 }],
      },
      HOJE,
      { dias: 120 },
    );
    expect(r.granularidade).toBe('semana');
    const atual = r.grupos[r.grupos.length - 1];
    expect(atual).toMatchObject({ inicio: '2026-11-16', fim: '2026-11-17', parcial: true, pesoMedioKg: 90, sonoMedioS: 7 * 3600, passosMedio: 7000, cargaHrss: 80 });
    const anterior = r.grupos[r.grupos.length - 2];
    expect(anterior).toMatchObject({ inicio: '2026-11-09', fim: '2026-11-15', parcial: false, pesoMedioKg: 91.5, sonoMedioS: null, cargaHrss: 20 });
  });

  it('começa no primeiro registro, com no mínimo 4 grupos', () => {
    const r = agruparTreinoECorpo({ pesagens: [{ data: '2026-11-11', pesoKg: 91 }] }, HOJE, { dias: 180 });
    expect(r.grupos).toHaveLength(4);
    expect(r.grupos[r.grupos.length - 1].inicio).toBe('2026-11-16');
    const longo = agruparTreinoECorpo({ pesagens: [{ data: '2026-06-01', pesoKg: 91 }] }, HOJE, { dias: 180 });
    expect(longo.grupos[0].inicio).toBe('2026-06-01'); // segunda-feira
  });

  it('agrupa por mês em períodos longos', () => {
    const r = agruparTreinoECorpo(
      { pesagens: [{ data: '2025-12-20', pesoKg: 95 }, { data: '2026-01-05', pesoKg: 94 }, { data: '2026-01-25', pesoKg: 93 }] },
      HOJE,
      { dias: 365 },
    );
    expect(r.granularidade).toBe('mes');
    expect(r.grupos[0]).toMatchObject({ inicio: '2025-12-01', fim: '2025-12-31', pesoMedioKg: 95 });
    expect(r.grupos[1]).toMatchObject({ inicio: '2026-01-01', fim: '2026-01-31', pesoMedioKg: 93.5 });
    expect(r.grupos[r.grupos.length - 1]).toMatchObject({ inicio: '2026-11-01', fim: HOJE, parcial: true });
  });

  it('agrupa por dia em períodos curtos', () => {
    const r = agruparTreinoECorpo(
      { bemEstar: [{ data: '2026-11-16', passos: 5000, sonoSegundos: 6 * 3600 }], estresse: [{ data: '2026-11-17', estresse: 40 }] },
      HOJE,
      { dias: 30 },
    );
    expect(r.granularidade).toBe('dia');
    expect(r.grupos.map((g) => g.inicio)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
    expect(r.grupos[2]).toMatchObject({ inicio: '2026-11-16', fim: '2026-11-16', parcial: false, passosMedio: 5000, sonoMedioS: 6 * 3600, cargaHrss: 0 });
    expect(r.grupos[3]).toMatchObject({ parcial: false, cargaHrss: 40 });
  });

  it('devolve vazio sem nenhum dado', () => {
    expect(agruparTreinoECorpo({}, HOJE, { dias: 90 }).grupos).toEqual([]);
  });
});
