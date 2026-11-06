import { describe, expect, it } from 'vitest';
import { esforcosDoEsporte, melhoresEsforcos, melhoresEsforcosDasAtividades, VERSAO_DOS_ESFORCOS } from './esforcos.js';

/** Amostras a cada 10 s em velocidade constante (m/s), com distância acumulada em metros. */
function amostras(velocidade, duracaoS) {
  const lista = [];
  for (let t = 0; t <= duracaoS; t += 10) lista.push({ t, dist: velocidade * t });
  return lista;
}

describe('melhoresEsforcos', () => {
  it('calcula 1, 5, 10, 20, 21 e 40 km em velocidade constante', () => {
    const r = melhoresEsforcos(amostras(4, 11000)); // 44 km a 4 m/s
    expect(r).toEqual({ melhor1kS: 250, melhor5kS: 1250, melhor10kS: 2500, melhor20kS: 5000, melhor21kS: 5274, melhor40kS: 10000 });
  });

  it('deixa nulo o que a atividade não alcança', () => {
    const r = melhoresEsforcos(amostras(3, 4000)); // 12 km
    expect(r.melhor10kS).toBe(3333);
    expect(r.melhor20kS).toBeNull();
    expect(r.melhor21kS).toBeNull();
    expect(r.melhor40kS).toBeNull();
  });

  it('acha o trecho mais rápido no meio da atividade', () => {
    const lista = [];
    let d = 0;
    for (let t = 0; t <= 2000; t += 10) {
      lista.push({ t, dist: d });
      d += t >= 500 && t < 700 ? 50 : 30; // 5 m/s entre 500 e 700 s, depois 3 m/s
    }
    const r = melhoresEsforcos(lista);
    expect(r.melhor1kS).toBe(200);
  });

  it('a versão do cálculo mudou para recalcular o histórico', () => {
    expect(VERSAO_DOS_ESFORCOS).toBe(3);
  });
});

describe('esforcosDoEsporte', () => {
  it('cada esporte mostra as suas distâncias', () => {
    expect(esforcosDoEsporte('corrida').map((e) => e.id)).toEqual(['melhor1k', 'melhor5k', 'melhor10k', 'melhor21k']);
    expect(esforcosDoEsporte('ciclismo').map((e) => e.id)).toEqual(['melhor5k', 'melhor10k', 'melhor20k', 'melhor40k']);
    expect(esforcosDoEsporte('outro')).toEqual([]);
  });
});

describe('melhoresEsforcosDasAtividades', () => {
  it('escolhe o menor tempo de cada distância (no empate, a mais antiga)', () => {
    const lista = [
      { id: 'a', data: '2026-03-01', melhor5kS: 1500, melhor1kS: 280 },
      { id: 'b', data: '2026-02-01', melhor5kS: 1400, melhor1kS: 280 },
      { id: 'c', data: '2026-04-01', melhor5kS: 1400 },
    ];
    const r = melhoresEsforcosDasAtividades(lista);
    expect(r.melhor5k.atividade.id).toBe('b');
    expect(r.melhor1k.atividade.id).toBe('b');
    expect(r.melhor21k).toBeNull();
  });
});
