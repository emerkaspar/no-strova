import { describe, expect, it } from 'vitest';
import { FRASES_DO_TREINO, fraseDoTreino, NIVEIS_DE_ESFORCO, nivelDeEsforco } from './frasesDoTreino.js';

describe('nivelDeEsforco', () => {
  it('sobe com o HRSS e cai em moderado quando não há valor', () => {
    expect([10, 30, 60, 100, 200].map(nivelDeEsforco)).toEqual(['muito-facil', 'leve', 'moderado', 'forte', 'brutal']);
    expect(nivelDeEsforco(null)).toBe('moderado');
    expect(nivelDeEsforco(0)).toBe('moderado');
  });
});

describe('fraseDoTreino', () => {
  it('tem variedade em todos os níveis, antes e depois, sem repetir', () => {
    for (const { id } of NIVEIS_DE_ESFORCO) {
      for (const tempo of ['antes', 'depois']) {
        const lista = FRASES_DO_TREINO[id][tempo];
        expect(lista.length).toBeGreaterThanOrEqual(6);
        expect(new Set(lista).size).toBe(lista.length);
      }
    }
  });

  it('é estável para a mesma data e varia entre datas', () => {
    expect(fraseDoTreino({ hrss: 70, data: '2026-11-06' })).toBe(fraseDoTreino({ hrss: 70, data: '2026-11-06' }));
    const frases = new Set(Array.from({ length: 14 }, (_, i) => fraseDoTreino({ hrss: 70, data: `2026-11-${String(i + 1).padStart(2, '0')}` })));
    expect(frases.size).toBeGreaterThan(3);
  });

  it('usa o tom do esforço e do momento (antes × depois)', () => {
    expect(FRASES_DO_TREINO.brutal.antes).toContain(fraseDoTreino({ hrss: 150, data: '2026-11-06' }));
    expect(FRASES_DO_TREINO['muito-facil'].depois).toContain(fraseDoTreino({ hrss: 8, data: '2026-11-06', feito: true }));
  });
});
