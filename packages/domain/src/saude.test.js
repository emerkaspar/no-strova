import { describe, expect, it } from 'vitest';
import { leituraDoPeriodo, resumoSaude } from './saude.js';

const HOJE = '2026-11-17';
const H = 3600;

/** Dias `de` a `ate` com o mesmo valor de sono e passos. */
function bemEstarFixo(de, ate, sonoS, passos) {
  const lista = [];
  for (let d = new Date(`${de}T00:00:00Z`); d <= new Date(`${ate}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) lista.push({ data: d.toISOString().slice(0, 10), sonoSegundos: sonoS, passos });
  return lista;
}

describe('resumoSaude', () => {
  it('compara o período com o anterior de mesmo tamanho', () => {
    const r = resumoSaude({
      pesagens: [{ data: '2026-10-01', pesoKg: 93 }, { data: '2026-11-15', pesoKg: 91 }],
      bemEstar: [...bemEstarFixo('2026-10-19', '2026-11-01', 7 * H, 9000), ...bemEstarFixo('2026-11-02', '2026-11-17', 6 * H, 6000)],
      estresse: [{ data: '2026-10-25', estresse: 100 }, { data: '2026-11-10', estresse: 200 }],
      metaPassos: 8000,
      hoje: HOJE,
      dias: 30,
    });
    // 30 dias (19/10 a 17/11): 14 noites de 7 h e 16 de 6 h
    expect(r.sono.mediaS).toBeCloseTo((14 * 7 * H + 16 * 6 * H) / 30, 5);
    expect(r.sono.faixa).toBe('curto');
    expect(r.sono.noites).toBe(30);
    expect(r.sono.anteriorS).toBeNull(); // não há registros nos 30 dias anteriores
    expect(r.passos.pctMeta).toBeCloseTo(((14 * 9000 + 16 * 6000) / 30 / 8000) * 100, 5);
    expect(r.peso).toMatchObject({ atualKg: 91, variacaoKg: -2 });
    expect(r.carga.total).toBe(300);
    // as séries das mini-linhas trazem a data de cada ponto
    expect(r.sono.serie[0]).toMatchObject({ data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), valor: expect.any(Number) });
    expect(r.peso.serie).toEqual([{ data: '2026-11-15', fim: '2026-11-15', valor: 91 }]);
    expect(r.carga.granularidade).toBe('dia');
    expect(r.carga.referenciaPorGrupo).toBeNull(); // sem carga no período anterior
  });

  it('a carga do período anterior vira a linha de comparação (por dia, semana ou mês)', () => {
    const r = resumoSaude({ estresse: [{ data: '2026-10-05', estresse: 300 }, { data: '2026-11-10', estresse: 100 }], hoje: HOJE, dias: 30 });
    expect(r.carga.granularidade).toBe('dia');
    expect(r.carga.referenciaPorGrupo).toBeCloseTo(300 / 30, 5);
  });

  it('sem período anterior quando o período é todo o histórico', () => {
    const r = resumoSaude({ bemEstar: [{ data: '2026-11-10', sonoSegundos: 7 * H, passos: 5000 }], hoje: HOJE, dias: null });
    expect(r.sono.anteriorS).toBeNull();
    expect(r.carga.variacaoPct).toBeNull();
  });
});

describe('leituraDoPeriodo', () => {
  const base = {
    peso: { atualKg: 90, data: HOJE, variacaoKg: null, semanalKg: null, serie: [] },
    sono: { mediaS: null, noites: 0, anteriorS: null, faixa: null, serie: [] },
    passos: { media: null, dias: 0, anterior: null, pctMeta: null, meta: 8000, serie: [] },
    carga: { total: 0, porSemana: 0, anteriorPorSemana: null, variacaoPct: null, serie: [] },
  };

  it('descreve sono e passos com o tom certo', () => {
    const frases = leituraDoPeriodo({ ...base, sono: { ...base.sono, mediaS: 5 * H + 49 * 60, faixa: 'muito-curto', anteriorS: 6 * H + 40 * 60 }, passos: { ...base.passos, media: 6063, pctMeta: 75.8 } });
    expect(frases[0]).toMatchObject({ tema: 'sono', tom: 'alerta' });
    expect(frases[0].texto).toContain('5 h 49 min');
    expect(frases[0].texto).toContain('contra o período anterior');
    expect(frases[1]).toMatchObject({ tema: 'passos', tom: 'atencao' });
    expect(frases[1].texto).toContain('76% da meta de 8.000');
  });

  it('avisa quando a carga sobe e o sono está curto, em primeiro lugar', () => {
    const frases = leituraDoPeriodo({
      ...base,
      sono: { ...base.sono, mediaS: 6 * H, faixa: 'curto' },
      carga: { total: 600, porSemana: 150, anteriorPorSemana: 100, variacaoPct: 50, serie: [] },
    });
    expect(frases[0]).toMatchObject({ tema: 'cruzado', tom: 'alerta' });
  });

  it('o peso é bom quando vai na direção da meta', () => {
    const peso = { ...base.peso, variacaoKg: -1.2, semanalKg: -0.3 };
    expect(leituraDoPeriodo({ ...base, peso }, { perderPeso: true })[0].tom).toBe('ok');
    expect(leituraDoPeriodo({ ...base, peso }, { perderPeso: false })[0].tom).toBe('atencao');
    expect(leituraDoPeriodo({ ...base, peso })[0].tom).toBe('neutro');
  });

  it('não devolve frases sem dados', () => {
    expect(leituraDoPeriodo(base)).toEqual([]);
  });
});
